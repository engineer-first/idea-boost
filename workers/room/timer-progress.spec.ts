import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ServerMessage } from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  runInRoomDO,
} from "../test-helpers";
import { RoomBroadcaster } from "./broadcast";
import type { HandlerCtx } from "./handler-context";
import { getPhase, getPhaseRevision, phaseHandlers, savePhase } from "./phase";
import { captureRollbackCheckpoint, rollbackHandlers } from "./phase-rollback";
import { sharingHandlers } from "./sharing";
import {
  getSharingState,
  resetSharingForPhase,
  saveSharingState,
} from "./sharing-state";
import { getTimerState, saveTimerState, timerHandlers } from "./timer";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "ホスト",
  email: "host@example.test",
};
const member = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "参加者",
  email: "member@example.test",
};

async function setup(step: 1 | 2 = 1) {
  const room = await createRoomAs(host);
  await joinRoomAs(member, room.inviteCode);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(room.roomId)).setPhase(
    { kind: "step", phase: 1, step },
    host.sub,
  );
  if (step === 2)
    await runInRoomDO(room.roomId, (_, state) =>
      resetSharingForPhase(state.storage.sql, {
        kind: "step",
        phase: 1,
        step: 2,
      }),
    );
  return room.roomId;
}

describe("タイマーと完了条件に応じた進行", () => {
  it.each([0, 1])(
    "発表者%d本人の完了は時間途中でも交代し、最後なら次の工程へ進む",
    async (index) => {
      const roomId = await setup(2);
      await runInRoomDO(roomId, async (_, state) => {
        const sql = state.storage.sql;
        const sharing = getSharingState(sql);
        if (!sharing) throw new Error("共有状態がありません");
        saveSharingState(sql, {
          ...sharing,
          status: "active",
          currentIndex: index,
          startsAt: null,
          results: index === 0 ? [] : ["done"],
        });
        saveTimerState(sql, {
          status: "running",
          endsAt: Date.now() + 180_000,
          durationMs: 180_000,
        });
        const ctx: HandlerCtx = {
          sql,
          storage: state.storage,
          userId: sharing.order[index].userId,
          ws: new WebSocketPair()[0],
          reply: () => {},
          broadcaster: new RoomBroadcaster(state),
          refreshSnapshots: () => {},
        };
        await sharingHandlers["sharing:advance"](ctx, {
          type: "sharing:advance",
          revision: sharing.revision,
          outcome: "done",
        });
        if (index === 0) {
          expect(getSharingState(sql)).toMatchObject({
            status: "active",
            currentIndex: 1,
            results: ["done"],
          });
        } else {
          expect(getPhase(sql)).toEqual({ kind: "step", phase: 1, step: 3 });
        }
      });
    },
  );
  it("時間切れ後も発表者以外は他人の発表を完了できない", async () => {
    const roomId = await setup(2);
    await runInRoomDO(roomId, async (_, state) => {
      const sql = state.storage.sql;
      const sharing = getSharingState(sql);
      if (!sharing) throw new Error("共有状態がありません");
      saveSharingState(sql, {
        ...sharing,
        status: "active",
        currentIndex: 0,
        startsAt: null,
        results: [],
      });
      saveTimerState(sql, { status: "ended", durationMs: 180_000 });
      const replies: ServerMessage[] = [];
      await sharingHandlers["sharing:advance"](
        {
          sql,
          storage: state.storage,
          userId: sharing.order[1].userId,
          ws: new WebSocketPair()[0],
          reply: (message) => replies.push(message),
          broadcaster: new RoomBroadcaster(state),
          refreshSnapshots: () => {},
        },
        {
          type: "sharing:advance",
          revision: sharing.revision,
          outcome: "done",
        },
      );
      expect(getSharingState(sql)).toMatchObject({
        currentIndex: 0,
        results: [],
      });
      expect(replies).toContainEqual(
        expect.objectContaining({ type: "error", code: "forbidden" }),
      );
    });
  });
  it("延長終了後も候補がなければ投票を開始しない", async () => {
    const roomId = await setup();
    await runInRoomDO(roomId, async (instance, state) => {
      await instance.setPhase({ kind: "step", phase: 1, step: 3 }, host.sub);
      saveTimerState(state.storage.sql, {
        status: "running",
        endsAt: Date.now() - 1,
        durationMs: 60_000,
        extensionUsed: true,
      });
      await instance.alarm();
      expect(getPhase(state.storage.sql)).toEqual({
        kind: "step",
        phase: 1,
        step: 3,
      });
    });
  });
  it("最終ステップでは延長終了後も成果の公開確認を待つ", async () => {
    const roomId = await setup();
    await runInRoomDO(roomId, async (instance, state) => {
      await instance.setPhase({ kind: "step", phase: 3, step: 5 }, host.sub);
      for (const phase of [1, 2, 3])
        state.storage.sql.exec(
          "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
          phase,
          crypto.randomUUID(),
          `採用案${phase}`,
          host.sub,
          new Date().toISOString(),
        );
      saveTimerState(state.storage.sql, {
        status: "running",
        endsAt: Date.now() - 1,
        durationMs: 60_000,
        extensionUsed: true,
      });
      await instance.alarm();
      expect(getPhase(state.storage.sql)).toEqual({
        kind: "step",
        phase: 3,
        step: 5,
      });
      expect(
        state.storage.sql
          .exec("SELECT outcome_published FROM room_state WHERE id=1")
          .one().outcome_published,
      ).toBe(0);
    });
  });
  it("延長した1分が終了すると次の工程へ進み、再度のalarmでは二重に進まない", async () => {
    const roomId = await setup();
    await runInRoomDO(roomId, async (instance, state) => {
      saveTimerState(state.storage.sql, {
        status: "running",
        endsAt: Date.now() - 1,
        durationMs: 60_000,
        extensionUsed: true,
      });
      await instance.alarm();
      expect(getPhase(state.storage.sql)).toEqual({
        kind: "step",
        phase: 1,
        step: 2,
      });
      expect(getTimerState(state.storage.sql)).toEqual({ status: "idle" });
      await instance.alarm();
      expect(getPhase(state.storage.sql)).toEqual({
        kind: "step",
        phase: 1,
        step: 2,
      });
    });
  });
  it.each([0, 1])(
    "発表者%dの延長終了で交代し、最後なら共有を終えて次の工程へ進む",
    async (index) => {
      const roomId = await setup(2);
      await runInRoomDO(roomId, async (instance, state) => {
        const sharing = getSharingState(state.storage.sql);
        if (!sharing) throw new Error("共有状態がありません");
        saveSharingState(state.storage.sql, {
          ...sharing,
          status: "active",
          currentIndex: index,
          startsAt: null,
          results: index === 0 ? [] : ["done"],
        });
        saveTimerState(state.storage.sql, {
          status: "running",
          endsAt: Date.now() - 1,
          durationMs: 60_000,
          extensionUsed: true,
        });
        await instance.alarm();
        if (index === 0) {
          expect(getPhase(state.storage.sql)).toEqual({
            kind: "step",
            phase: 1,
            step: 2,
          });
          expect(getSharingState(state.storage.sql)).toMatchObject({
            status: "active",
            currentIndex: 1,
            results: ["done"],
          });
          expect(getTimerState(state.storage.sql)).toEqual({ status: "idle" });
        } else {
          expect(getPhase(state.storage.sql)).toEqual({
            kind: "step",
            phase: 1,
            step: 3,
          });
        }
      });
    },
  );
  it("延長終了時に投票未完了なら待ち、最後の投票が届いたら全員を結果へ進める", async () => {
    const roomId = await setup();
    const noteId = crypto.randomUUID();
    await runInRoomDO(roomId, async (instance, state) => {
      await instance.setPhase({ kind: "step", phase: 1, step: 4 }, host.sub);
      state.storage.sql.exec(
        "INSERT INTO notes(id,author_id,content,visibility,color,x,y,phase,created_at,updated_at) VALUES(?,?,'投票対象','shared','yellow',0,0,1,'now','now')",
        noteId,
        host.sub,
      );
      for (const user of [host, member]) {
        for (const kind of ["subjective", "objective"] as const) {
          const count = kind === "subjective" ? 1 : user === host ? 3 : 2;
          for (let i = 0; i < count; i++)
            state.storage.sql.exec(
              "INSERT INTO note_vote_stickers(id,note_id,user_id,kind,x,y,created_at) VALUES(?,?,?,?,0.2,0.3,'now')",
              crypto.randomUUID(),
              noteId,
              user.sub,
              kind,
            );
        }
      }
      saveTimerState(state.storage.sql, {
        status: "running",
        endsAt: Date.now() + 60_000,
        durationMs: 60_000,
        extensionUsed: true,
      });
    });
    const a = await connectRoomAs(host, roomId);
    const b = await connectRoomAs(member, roomId);
    try {
      await a.next();
      await b.next();
      await runInRoomDO(roomId, async (instance, state) => {
        expect(new RoomBroadcaster(state).connectedUserIds(() => true)).toEqual(
          expect.arrayContaining([host.sub, member.sub]),
        );
        expect(
          state.storage.sql
            .exec(
              "SELECT COUNT(*) AS count FROM note_vote_stickers WHERE user_id=? AND kind='objective'",
              member.sub,
            )
            .one().count,
        ).toBe(2);
        expect(getPhase(state.storage.sql)).toEqual({
          kind: "step",
          phase: 1,
          step: 4,
        });
        state.storage.sql.exec(
          "UPDATE timer_state SET ends_at=? WHERE id=1",
          Date.now() - 1,
        );
        await instance.alarm();
        expect(getPhase(state.storage.sql)).toEqual({
          kind: "step",
          phase: 1,
          step: 4,
        });
      });
      b.ws.send(
        JSON.stringify({ type: "note:vote", noteId, kind: "objective" }),
      );
      for (const socket of [a, b]) {
        let message = await socket.next();
        while (message.type !== "phase:updated") {
          if (message.type === "error") throw new Error(message.message);
          message = await socket.next();
        }
        expect(message.phase).toEqual({ kind: "step", phase: 1, step: 5 });
      }
    } finally {
      a.close();
      b.close();
    }
  });
  it("延長終了時に採用未決定なら待ち、採用すると次のフェーズへ自動進行する", async () => {
    const roomId = await setup();
    const noteId = crypto.randomUUID();
    await runInRoomDO(roomId, async (instance, state) => {
      await instance.setPhase({ kind: "step", phase: 1, step: 5 }, host.sub);
      state.storage.sql.exec(
        "INSERT INTO notes(id,author_id,content,visibility,color,x,y,phase,created_at,updated_at) VALUES(?,?,'採用対象','shared','yellow',0,0,1,'now','now')",
        noteId,
        host.sub,
      );
      saveTimerState(state.storage.sql, {
        status: "running",
        endsAt: Date.now() - 1,
        durationMs: 60_000,
        extensionUsed: true,
      });
      await instance.alarm();
      expect(getPhase(state.storage.sql)).toEqual({
        kind: "step",
        phase: 1,
        step: 5,
      });
    });
    const a = await connectRoomAs(host, roomId);
    try {
      await a.next();
      a.ws.send(JSON.stringify({ type: "note:decide", noteId }));
      let message = await a.next();
      while (message.type !== "phase:updated") {
        if (message.type === "error") throw new Error(message.message);
        message = await a.next();
      }
      expect(message.phase).toEqual({ kind: "step", phase: 2, step: 1 });
    } finally {
      a.close();
    }
  });
  it("最初の時間切れでは自動で工程を進めず、延長を選べる", async () => {
    const roomId = await setup();
    await runInRoomDO(roomId, async (instance, state) => {
      saveTimerState(state.storage.sql, {
        status: "running",
        endsAt: Date.now() - 1,
        durationMs: 300_000,
      });
      await instance.alarm();
      expect(getPhase(state.storage.sql)).toEqual({
        kind: "step",
        phase: 1,
        step: 1,
      });
      expect(getTimerState(state.storage.sql)).toMatchObject({
        status: "ended",
      });
    });
  });
  it("延長中に早期進行して戻ると、残り時間と延長済みを保って計時を再開する", async () => {
    const roomId = await setup();
    const result = await runInRoomDO(roomId, async (_, state) => {
      const sql = state.storage.sql;
      saveTimerState(sql, {
        status: "running",
        endsAt: Date.now() + 45_000,
        durationMs: 60_000,
        extensionUsed: true,
      });
      captureRollbackCheckpoint(sql, getPhase(sql));
      savePhase(sql, { kind: "step", phase: 1, step: 2 });
      resetSharingForPhase(sql, getPhase(sql));
      const ctx: HandlerCtx = {
        sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: () => {},
        broadcaster: new RoomBroadcaster(state),
        refreshSnapshots: () => {},
      };
      await rollbackHandlers["phase:rollback"](ctx, {
        type: "phase:rollback",
        expectedPhase: getPhase(sql),
        expectedRevision: getPhaseRevision(sql),
      });
      return { phase: getPhase(sql), timer: getTimerState(sql) };
    });
    expect(result.phase).toEqual({ kind: "step", phase: 1, step: 1 });
    expect(result.timer).toMatchObject({
      status: "running",
      durationMs: 60_000,
      extensionUsed: true,
    });
  });
  it.each([1, 2] as const)(
    "工程1-%dを延長終了による進行後に戻すと1分を再計時し、新たな終了時だけ再び進む",
    async (step) => {
      const roomId = await setup(step);
      await runInRoomDO(roomId, async (instance, state) => {
        const sql = state.storage.sql;
        if (step === 2) {
          const sharing = getSharingState(sql);
          if (!sharing) throw new Error("共有状態がありません");
          saveSharingState(sql, {
            ...sharing,
            status: "active",
            currentIndex: 1,
            results: ["done"],
            startsAt: null,
          });
        }
        saveTimerState(sql, {
          status: "running",
          endsAt: Date.now() - 1,
          durationMs: 60_000,
          extensionUsed: true,
        });
        await instance.alarm();
        const nextPhase = getPhase(sql);
        expect(nextPhase).toEqual({ kind: "step", phase: 1, step: step + 1 });
        const ctx: HandlerCtx = {
          sql,
          storage: state.storage,
          userId: member.sub,
          ws: new WebSocketPair()[0],
          reply: () => {},
          broadcaster: new RoomBroadcaster(state),
          refreshSnapshots: () => {},
        };
        const restoredAt = Date.now();
        await rollbackHandlers["phase:rollback"](ctx, {
          type: "phase:rollback",
          expectedPhase: nextPhase,
          expectedRevision: getPhaseRevision(sql),
        });
        const restored = getTimerState(sql);
        expect(restored).toMatchObject({
          status: "running",
          durationMs: 60_000,
          extensionUsed: true,
        });
        if (restored.status !== "running")
          throw new Error("計時が再開されていません");
        expect(restored.endsAt).toBeGreaterThanOrEqual(restoredAt + 60_000);
        await instance.alarm();
        expect(getPhase(sql)).toEqual({ kind: "step", phase: 1, step });
        if (step === 2)
          expect(getSharingState(sql)).toMatchObject({
            status: "complete",
            currentIndex: null,
          });
        sql.exec("UPDATE timer_state SET ends_at=? WHERE id=1", Date.now() - 1);
        await instance.alarm();
        expect(getPhase(sql)).toEqual(nextPhase);
      });
    },
  );
  it("時間切れ後も投票が未完了なら結果ステップに進めない", async () => {
    const roomId = await setup();
    const result = await runInRoomDO(roomId, async (_, state) => {
      const sql = state.storage.sql;
      savePhase(sql, { kind: "step", phase: 1, step: 4 });
      saveTimerState(sql, { status: "ended", durationMs: 300_000 });
      const broadcaster = new RoomBroadcaster(state);
      broadcaster.connectedUserIds = () => [host.sub, member.sub];
      const replies: ServerMessage[] = [];
      const ctx: HandlerCtx = {
        sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: (message) => replies.push(message),
        broadcaster,
        refreshSnapshots: () => {},
      };
      await phaseHandlers["phase:next"](ctx, {
        type: "phase:next",
        expectedPhase: getPhase(sql),
        expectedRevision: getPhaseRevision(sql),
      });
      return { phase: getPhase(sql), replies };
    });
    expect(result.phase).toEqual({ kind: "step", phase: 1, step: 4 });
    expect(result.replies).toContainEqual(
      expect.objectContaining({ type: "error", code: "forbidden" }),
    );
  });
  it("共有が一巡した後は最後の発表者のタイマーを延長できない", async () => {
    const roomId = await setup(2);
    const result = await runInRoomDO(roomId, async (_, state) => {
      const sql = state.storage.sql;
      const sharing = getSharingState(sql);
      if (!sharing) throw new Error("共有状態がありません");
      saveSharingState(sql, {
        ...sharing,
        status: "complete",
        currentIndex: null,
        results: sharing.order.map(() => "done"),
        startsAt: null,
      });
      saveTimerState(sql, { status: "ended", durationMs: 60_000 });
      const replies: ServerMessage[] = [];
      const ctx: HandlerCtx = {
        sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: (message) => replies.push(message),
        broadcaster: new RoomBroadcaster(state),
        refreshSnapshots: () => {},
      };
      await timerHandlers["timer:extend"](ctx, { type: "timer:extend" });
      return { timer: getTimerState(sql), replies };
    });
    expect(result.timer.status).toBe("ended");
    expect(result.replies).toContainEqual(
      expect.objectContaining({ type: "error", code: "forbidden" }),
    );
  });
  it("稼働中でも接続中の全員がチェック済みなら次へ進める", async () => {
    const roomId = await setup();
    const result = await runInRoomDO(roomId, async (_, state) => {
      const sql = state.storage.sql;
      const broadcaster = new RoomBroadcaster(state);
      broadcaster.connectedUserIds = () => [host.sub, member.sub];
      const ctx: HandlerCtx = {
        sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: () => {},
        broadcaster,
        refreshSnapshots: () => {},
      };
      saveTimerState(sql, {
        status: "running",
        durationMs: 300_000,
        endsAt: Date.now() + 300_000,
      });
      const revision = getPhaseRevision(sql);
      for (const userId of [host.sub, member.sub]) {
        sql.exec(
          "INSERT INTO phase_progress_ready (phase_revision,user_id,ready,updated_at) VALUES (?1,?2,1,?3)",
          revision,
          userId,
          Date.now(),
        );
      }
      await phaseHandlers["phase:next"](ctx, {
        type: "phase:next",
        expectedPhase: getPhase(sql),
        expectedRevision: revision,
      });
      return getPhase(sql);
    });
    expect(result).toEqual({ kind: "step", phase: 1, step: 2 });
  });

  it("未開始のタイマーでは全員のチェックがなければ次へ進めない", async () => {
    const roomId = await setup();
    const result = await runInRoomDO(roomId, async (_, state) => {
      const sql = state.storage.sql;
      const broadcaster = new RoomBroadcaster(state);
      broadcaster.connectedUserIds = () => [host.sub, member.sub];
      const ctx: HandlerCtx = {
        sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: () => {},
        broadcaster,
        refreshSnapshots: () => {},
      };
      saveTimerState(sql, { status: "idle" });
      await phaseHandlers["phase:next"](ctx, {
        type: "phase:next",
        expectedPhase: getPhase(sql),
        expectedRevision: getPhaseRevision(sql),
      });
      return getPhase(sql);
    });
    expect(result).toEqual({ kind: "step", phase: 1, step: 1 });
  });

  it("採用決定のステップでも各参加者が完了をチェックできる", async () => {
    const roomId = await setup();
    const result = await runInRoomDO(roomId, (_, state) => {
      const sql = state.storage.sql;
      savePhase(sql, { kind: "step", phase: 1, step: 5 });
      const ctx: HandlerCtx = {
        sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: () => {},
        broadcaster: new RoomBroadcaster(state),
        refreshSnapshots: () => {},
      };
      phaseHandlers["phase:ready"](ctx, {
        type: "phase:ready",
        ready: true,
        expectedPhase: getPhase(sql),
        expectedRevision: getPhaseRevision(sql),
      });
      return sql
        .exec(
          "SELECT user_id FROM phase_progress_ready WHERE user_id = ?1",
          member.sub,
        )
        .toArray();
    });
    expect(result).toHaveLength(1);
  });

  it("共有中は時間切れまで発表者を交代できない", async () => {
    const roomId = await setup(2);
    const result = await runInRoomDO(roomId, async (_, state) => {
      const sql = state.storage.sql;
      const ctx: HandlerCtx = {
        sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: () => {},
        broadcaster: new RoomBroadcaster(state),
        refreshSnapshots: () => {},
      };
      const sharing = getSharingState(sql);
      if (!sharing) throw new Error("共有状態がありません");
      saveSharingState(sql, {
        ...sharing,
        status: "active",
        currentIndex: 0,
        results: [],
        startsAt: null,
      });
      saveTimerState(sql, {
        status: "running",
        durationMs: 60_000,
        endsAt: Date.now() + 60_000,
      });
      await sharingHandlers["sharing:advance"](ctx, {
        type: "sharing:advance",
        revision: sharing.revision,
        outcome: "done",
      });
      return getSharingState(sql);
    });
    expect(result).toMatchObject({
      status: "active",
      currentIndex: 0,
      results: [],
    });
  });
  it("終了後の1分延長を保存し、再度の時間切れ後は延長を拒否する", async () => {
    const roomId = await setup();
    const result = await runInRoomDO(roomId, async (_, state) => {
      const replies: ServerMessage[] = [];
      const ctx: HandlerCtx = {
        sql: state.storage.sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: (message) => replies.push(message),
        broadcaster: new RoomBroadcaster(state),
        refreshSnapshots: () => {},
      };
      saveTimerState(ctx.sql, { status: "ended", durationMs: 300_000 });
      await timerHandlers["timer:extend"](ctx, { type: "timer:extend" });
      const extended = getTimerState(ctx.sql);
      ctx.sql.exec(
        "UPDATE timer_state SET ends_at = ?1 WHERE id = 1",
        Date.now() - 1,
      );
      const expired = getTimerState(ctx.sql);
      await timerHandlers["timer:extend"](ctx, { type: "timer:extend" });
      return { extended, expired, replies };
    });
    expect(result.extended).toMatchObject({
      status: "running",
      durationMs: 60_000,
      extensionUsed: true,
    });
    expect(result.expired).toMatchObject({
      status: "ended",
      extensionUsed: true,
    });
    expect(result.replies).toContainEqual(
      expect.objectContaining({ type: "error", code: "forbidden" }),
    );
  });
  it("稼働中の次ステップへの要求を拒否し、工程を保つ", async () => {
    const roomId = await setup();
    const result = await runInRoomDO(roomId, async (_, state) => {
      const replies: ServerMessage[] = [];
      const ctx: HandlerCtx = {
        sql: state.storage.sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: (message) => replies.push(message),
        broadcaster: new RoomBroadcaster(state),
        refreshSnapshots: () => {},
      };
      saveTimerState(ctx.sql, {
        status: "running",
        durationMs: 300_000,
        endsAt: Date.now() + 300_000,
      });
      await phaseHandlers["phase:next"](ctx, {
        type: "phase:next",
        expectedPhase: getPhase(ctx.sql),
        expectedRevision: getPhaseRevision(ctx.sql),
      });
      return { phase: getPhase(ctx.sql), replies };
    });
    expect(result.phase).toEqual({ kind: "step", phase: 1, step: 1 });
    expect(result.replies).toContainEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("タイマー"),
      }),
    );
  });

  it.each(["ended"] as const)(
    "%sでは完了チェックを要求せず参加者が明示して次へ進める",
    async (status) => {
      const roomId = await setup();
      const phase = await runInRoomDO(roomId, async (_, state) => {
        const ctx: HandlerCtx = {
          sql: state.storage.sql,
          storage: state.storage,
          userId: member.sub,
          ws: new WebSocketPair()[0],
          reply: () => {},
          broadcaster: new RoomBroadcaster(state),
          refreshSnapshots: () => {},
        };
        saveTimerState(ctx.sql, { status, durationMs: 300_000 });
        await phaseHandlers["phase:next"](ctx, {
          type: "phase:next",
          expectedPhase: getPhase(ctx.sql),
          expectedRevision: getPhaseRevision(ctx.sql),
        });
        return getPhase(ctx.sql);
      });
      expect(phase).toEqual({ kind: "step", phase: 1, step: 2 });
    },
  );

  it("最後の発表者が完了すると次の工程へ進む", async () => {
    const roomId = await setup(2);
    const result = await runInRoomDO(roomId, async (_, state) => {
      const ctx: HandlerCtx = {
        sql: state.storage.sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: () => {},
        broadcaster: new RoomBroadcaster(state),
        refreshSnapshots: () => {},
      };
      const sharing = getSharingState(ctx.sql);
      if (!sharing) throw new Error("共有状態がありません");
      saveSharingState(ctx.sql, {
        ...sharing,
        status: "active",
        currentIndex: sharing.order.length - 1,
        results: sharing.order.slice(1).map(() => "done" as const),
        startsAt: null,
      });
      saveTimerState(ctx.sql, {
        status: "ended",
        durationMs: sharing.durationMs,
      });
      await sharingHandlers["sharing:advance"](ctx, {
        type: "sharing:advance",
        revision: sharing.revision,
        outcome: "done",
      });
      return { phase: getPhase(ctx.sql), sharing: getSharingState(ctx.sql) };
    });
    expect(result.phase).toEqual({ kind: "step", phase: 1, step: 3 });
    expect(result.sharing?.status).toBe("inactive");
  });

  it.each([1, 2, 3] as const)(
    "フェーズ%iの共有一巡後は付箋0枚でも次の工程へ進める",
    async (phase) => {
      const roomId = await setup(2);
      const result = await runInRoomDO(roomId, async (_, state) => {
        const sql = state.storage.sql;
        const current = { kind: "step" as const, phase, step: 2 };
        savePhase(sql, current);
        resetSharingForPhase(sql, current);
        const sharing = getSharingState(sql);
        if (!sharing) throw new Error("共有状態がありません");
        saveSharingState(sql, {
          ...sharing,
          status: "complete",
          currentIndex: null,
          results: sharing.order.map(() => "passed"),
          startsAt: null,
        });
        saveTimerState(sql, {
          status: "ended",
          durationMs: sharing.durationMs,
        });
        const replies: ServerMessage[] = [];
        const ctx: HandlerCtx = {
          sql,
          storage: state.storage,
          userId: member.sub,
          ws: new WebSocketPair()[0],
          reply: (message) => replies.push(message),
          broadcaster: new RoomBroadcaster(state),
          refreshSnapshots: () => {},
        };
        await phaseHandlers["phase:next"](ctx, {
          type: "phase:next",
          expectedPhase: current,
          expectedRevision: getPhaseRevision(sql),
        });
        return { phase: getPhase(sql), replies };
      });
      expect(result.phase).toEqual({ kind: "step", phase, step: 3 });
      expect(result.replies).not.toContainEqual(
        expect.objectContaining({ type: "error" }),
      );
    },
  );

  it("一巡後に共有を続けると先頭の発表をもう一度予約し、古い要求では再開始しない", async () => {
    const roomId = await setup(2);
    const result = await runInRoomDO(roomId, async (_, state) => {
      const ctx: HandlerCtx = {
        sql: state.storage.sql,
        storage: state.storage,
        userId: member.sub,
        ws: new WebSocketPair()[0],
        reply: () => {},
        broadcaster: new RoomBroadcaster(state),
        refreshSnapshots: () => {},
      };
      const sharing = getSharingState(ctx.sql);
      if (!sharing) throw new Error("共有状態がありません");
      saveSharingState(ctx.sql, {
        ...sharing,
        status: "complete",
        results: sharing.order.map(() => "done" as const),
        currentIndex: null,
        startsAt: null,
      });
      const message = {
        type: "sharing:start" as const,
        revision: sharing.revision,
        durationMs: sharing.durationMs,
      };
      await sharingHandlers["sharing:start"](ctx, message);
      const first = getSharingState(ctx.sql);
      await sharingHandlers["sharing:start"](ctx, message);
      return { first, second: getSharingState(ctx.sql) };
    });
    expect(result.first).toMatchObject({
      status: "active",
      currentIndex: 0,
      results: [],
      startsAt: expect.any(Number),
    });
    expect(result.second).toEqual(result.first);
  });
});

it.each([
  { step: 2, candidate: false, reason: "共有未完了" },
  { step: 3, candidate: false, reason: "投票候補なし" },
  { step: 5, candidate: true, reason: "採用候補あり・採用未決定" },
])("時間切れ後も$reasonでは次の工程へ進めない", async ({ step, candidate }) => {
  const roomId = await setup();
  const result = await runInRoomDO(roomId, async (_, state) => {
    const sql = state.storage.sql;
    const phase = { kind: "step" as const, phase: 1 as const, step };
    savePhase(sql, phase);
    resetSharingForPhase(sql, phase);
    if (candidate) {
      const now = new Date().toISOString();
      sql.exec(
        "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, '候補', 'shared', 'yellow', 40, 50, 1, ?3, ?3)",
        crypto.randomUUID(),
        member.sub,
        now,
      );
    }
    saveTimerState(sql, {
      status: "ended",
      durationMs: 300000,
    });
    const replies: ServerMessage[] = [];
    const ctx: HandlerCtx = {
      sql,
      storage: state.storage,
      userId: member.sub,
      ws: new WebSocketPair()[0],
      reply: (m) => replies.push(m),
      broadcaster: new RoomBroadcaster(state),
      refreshSnapshots: () => {},
    };
    await phaseHandlers["phase:next"](ctx, {
      type: "phase:next",
      expectedPhase: phase,
      expectedRevision: getPhaseRevision(sql),
    });
    return { phase: getPhase(sql), replies };
  });
  expect(result.phase).toEqual({ kind: "step", phase: 1, step });
  expect(result.replies).toContainEqual(
    expect.objectContaining({ type: "error", code: "forbidden" }),
  );
});

it("延長が確定直前に割り込んだ場合は次の工程へ進めない", async () => {
  const roomId = await setup();
  const result = await runInRoomDO(roomId, async (_, state) => {
    const sql = state.storage.sql;
    saveTimerState(sql, {
      status: "ended",
      durationMs: 300000,
    });
    let resumed = false;
    const ctx: HandlerCtx = {
      sql,
      storage: state.storage,
      userId: member.sub,
      ws: new WebSocketPair()[0],
      reply: () => {},
      broadcaster: new RoomBroadcaster(state),
      refreshSnapshots: () => {},
      authorizeMutation: () => {
        if (!resumed) {
          resumed = true;
          saveTimerState(sql, {
            status: "running",
            endsAt: Date.now() + 100000,
            durationMs: 300000,
          });
        }
        return true;
      },
    };
    await phaseHandlers["phase:next"](ctx, {
      type: "phase:next",
      expectedPhase: getPhase(sql),
      expectedRevision: getPhaseRevision(sql),
    });
    return { phase: getPhase(sql), timer: getTimerState(sql) };
  });
  expect(result.phase).toEqual({ kind: "step", phase: 1, step: 1 });
  expect(result.timer.status).toBe("running");
});

it("時間切れで次の工程へ進んだ後は遅れた延長でタイマーを上書きしない", async () => {
  const roomId = await setup();
  const result = await runInRoomDO(roomId, async (_, state) => {
    const sql = state.storage.sql;
    saveTimerState(sql, {
      status: "ended",
      durationMs: 300000,
    });
    const ctx: HandlerCtx = {
      sql,
      storage: state.storage,
      userId: member.sub,
      ws: new WebSocketPair()[0],
      reply: () => {},
      broadcaster: new RoomBroadcaster(state),
      refreshSnapshots: () => {},
    };
    await phaseHandlers["phase:next"](ctx, {
      type: "phase:next",
      expectedPhase: getPhase(sql),
      expectedRevision: getPhaseRevision(sql),
    });
    const before = getTimerState(sql);
    await timerHandlers["timer:extend"](ctx, { type: "timer:extend" });
    return { phase: getPhase(sql), before, after: getTimerState(sql) };
  });
  expect(result.phase).toEqual({ kind: "step", phase: 1, step: 2 });
  expect(result.after).toEqual(result.before);
});

it("共有再開が先に確定した場合は、その一巡を飛ばして次工程へ進めない", async () => {
  const roomId = await setup(2);
  const phase = await runInRoomDO(roomId, async (_, state) => {
    const sql = state.storage.sql;
    const sharing = getSharingState(sql);
    if (!sharing) throw new Error("共有状態がありません");
    saveSharingState(sql, {
      ...sharing,
      status: "complete",
      currentIndex: null,
      results: sharing.order.map(() => "done"),
      startsAt: null,
    });
    saveTimerState(sql, { status: "ended", durationMs: sharing.durationMs });
    let interleaved = false;
    const ctx: HandlerCtx = {
      sql,
      storage: state.storage,
      userId: member.sub,
      ws: new WebSocketPair()[0],
      reply: () => {},
      broadcaster: new RoomBroadcaster(state),
      refreshSnapshots: () => {},
      authorizeMutation: () => {
        if (!interleaved) {
          interleaved = true;
          saveSharingState(sql, {
            ...sharing,
            status: "active",
            currentIndex: 0,
            results: [],
            startsAt: Date.now() + 2000,
            revision: crypto.randomUUID(),
          });
        }
        return true;
      },
    };
    await phaseHandlers["phase:next"](ctx, {
      type: "phase:next",
      expectedPhase: getPhase(sql),
      expectedRevision: getPhaseRevision(sql),
    });
    return getPhase(sql);
  });
  expect(phase).toEqual({ kind: "step", phase: 1, step: 2 });
});
it("次工程への移行が先に確定した場合は、遅れた共有再開でタイマーを上書きしない", async () => {
  const roomId = await setup(2);
  const result = await runInRoomDO(roomId, async (_, state) => {
    const sql = state.storage.sql;
    const sharing = getSharingState(sql);
    if (!sharing) throw new Error("共有状態がありません");
    saveSharingState(sql, {
      ...sharing,
      status: "complete",
      currentIndex: null,
      results: sharing.order.map(() => "done"),
      startsAt: null,
    });
    let interleaved = false;
    const ctx: HandlerCtx = {
      sql,
      storage: state.storage,
      userId: member.sub,
      ws: new WebSocketPair()[0],
      reply: () => {},
      broadcaster: new RoomBroadcaster(state),
      refreshSnapshots: () => {},
      authorizeMutation: () => {
        if (!interleaved) {
          interleaved = true;
          savePhase(sql, { kind: "step", phase: 1, step: 3 });
          resetSharingForPhase(sql, { kind: "step", phase: 1, step: 3 });
          saveTimerState(sql, {
            status: "running",
            durationMs: 240000,
            endsAt: Date.now() + 240000,
          });
        }
        return true;
      },
    };
    await sharingHandlers["sharing:start"](ctx, {
      type: "sharing:start",
      revision: sharing.revision,
      durationMs: sharing.durationMs,
    });
    return {
      phase: getPhase(sql),
      sharing: getSharingState(sql),
      timer: sql.exec("SELECT status,duration_ms FROM timer_state").one(),
    };
  });
  expect(result.phase).toEqual({ kind: "step", phase: 1, step: 3 });
  expect(result.sharing?.status).toBe("inactive");
  expect(result.timer).toMatchObject({
    status: "running",
    duration_ms: 240000,
  });
});
