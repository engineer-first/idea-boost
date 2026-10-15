import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  startTimerForTest,
} from "../test-helpers";
import { captureRollbackCheckpoint } from "./phase-rollback";
import {
  getSharingState,
  resetSharingForPhase,
  saveSharingState,
} from "./sharing-state";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "Host",
  email: "host@test.example",
};
const member = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "Member",
  email: "member@test.example",
};
const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});
async function setup() {
  const { roomId, inviteCode } = await createRoomAs(host);
  await joinRoomAs(member, inviteCode);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  await stub.setPhase({ kind: "step", phase: 1, step: 3 }, host.sub);
  const a = await connectRoomAs(host, roomId);
  sockets.push(a);
  await a.next();
  const b = await connectRoomAs(member, roomId);
  sockets.push(b);
  await b.next();
  return { roomId, stub, a, b };
}
describe("直前ステップへの復元", () => {
  it("非ホストの復元要求を拒否する", async () => {
    const { roomId, stub, a, b } = await setup();
    const id = await seed(roomId);
    await next(roomId, a, b);
    const expected = await currentPhaseExpectation(roomId);
    b.ws.send(
      JSON.stringify({
        type: "phase:rollback",
        expectedHostRevision: 0,
        ...expected,
      }),
    );
    expect(await b.next()).toMatchObject({ type: "error", code: "forbidden" });
    expect(await stub.getPhase()).toEqual(expected.expectedPhase);
    // 拒否が復元履歴を消費せず、正規のホストは同じ履歴へ戻れる。
    const [snapshot] = await rollback(roomId, a, b);
    expect(snapshot).toMatchObject({
      phase: { kind: "step", phase: 1, step: 3 },
      notes: [expect.objectContaining({ id })],
    });
  });
  it("即時進行後の古い更新番号による復元は拒否する", async () => {
    const { roomId, stub, a, b } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, host.sub);
    const expected = await currentPhaseExpectation(roomId);
    a.ws.send(JSON.stringify({ type: "phase:next", ...expected }));
    await Promise.all([until(a, "phase:updated"), until(b, "phase:updated")]);
    a.ws.send(
      JSON.stringify({
        type: "phase:rollback",
        expectedHostRevision: 0,
        ...expected,
      }),
    );
    expect(await a.next()).toMatchObject({ type: "error", code: "forbidden" });
    expect(await stub.getPhase()).toEqual({ kind: "step", phase: 1, step: 2 });
    const [snapshot] = await rollback(roomId, a, b);
    expect(snapshot).toMatchObject({ phase: expected.expectedPhase });
  });

  it("履歴がないホストの要求も拒否する", async () => {
    const { roomId, a } = await setup();
    a.ws.send(
      JSON.stringify({
        type: "phase:rollback",
        expectedHostRevision: 0,
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    expect(await a.next()).toMatchObject({ type: "error", code: "forbidden" });
  });
  it("通常進行前の付箋に戻し、進行後の作業を破棄して本人だけに下書きを返す", async () => {
    const { roomId, stub, a, b } = await setup();
    const sharedId = crypto.randomUUID();
    const privateId = crypto.randomUUID();
    const laterId = crypto.randomUUID();
    await runInRoomDO(roomId, (_room, state) => {
      state.storage.sql.exec(
        "INSERT INTO notes (id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES (?,?,?,20,30,'now','now','private',1)",
        privateId,
        host.sub,
        "本人の下書き",
      );
      state.storage.sql.exec(
        "INSERT INTO notes (id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES (?,?,?,20,30,'now','now','shared',1)",
        sharedId,
        host.sub,
        "共有済み",
      );
    });
    await runInRoomDO(roomId, (_room, state) => {
      captureRollbackCheckpoint(state.storage.sql, {
        kind: "step",
        phase: 1,
        step: 3,
      });
      state.storage.sql.exec("DELETE FROM phase_rollback_checkpoints");
    });
    a.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    for (const socket of [a, b]) {
      let message = await socket.next();
      while (message.type !== "phase:updated") {
        if (message.type === "error") throw new Error(JSON.stringify(message));
        message = await socket.next();
      }
    }
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec(
        "INSERT INTO notes (id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES (?,?,?,0,0,'now','now','shared',1)",
        laterId,
        member.sub,
        "後の作業",
      ),
    );
    a.ws.send(
      JSON.stringify({
        type: "phase:rollback",
        expectedHostRevision: 0,
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    const restored = await a.next();
    const peer = await b.next();
    expect(restored).toMatchObject({
      type: "snapshot",
      phase: { kind: "step", phase: 1, step: 3 },
      notes: expect.arrayContaining([
        expect.objectContaining({ id: privateId, content: "本人の下書き" }),
      ]),
    });
    expect(peer).toMatchObject({ type: "snapshot", notes: [{ id: sharedId }] });
    expect(await stub.getPhase()).toEqual({ kind: "step", phase: 1, step: 3 });
    expect(
      await runInRoomDO(roomId, (_room, state) =>
        state.storage.sql
          .exec(
            "SELECT action,phase_json,next_phase_json FROM progress_history WHERE action='rollback'",
          )
          .toArray(),
      ),
    ).toEqual([
      {
        action: "rollback",
        phase_json: JSON.stringify({ kind: "step", phase: 1, step: 4 }),
        next_phase_json: JSON.stringify({ kind: "step", phase: 1, step: 3 }),
      },
    ]);
  });
});

async function until(socket: RoomSocket, type: string) {
  for (let i = 0; i < 30; i++) {
    const message = await socket.next();
    if (message.type === "error") throw new Error(JSON.stringify(message));
    if (message.type === type) return message;
  }
  throw new Error(`missing ${type}`);
}
async function next(roomId: string, a: RoomSocket, b: RoomSocket) {
  a.ws.send(
    JSON.stringify({
      type: "phase:next",
      force: true,
      ...(await currentPhaseExpectation(roomId)),
    }),
  );
  await Promise.all([until(a, "phase:updated"), until(b, "phase:updated")]);
}
async function rollback(
  roomId: string,
  a: RoomSocket,
  b: RoomSocket,
  hostRevision = 0,
) {
  a.ws.send(
    JSON.stringify({
      type: "phase:rollback",
      expectedHostRevision: hostRevision,
      ...(await currentPhaseExpectation(roomId)),
    }),
  );
  return Promise.all([until(a, "snapshot"), until(b, "snapshot")]);
}
async function seed(roomId: string, author = host.sub) {
  const id = crypto.randomUUID();
  await runInRoomDO(roomId, (_room, state) =>
    state.storage.sql.exec(
      "INSERT INTO notes (id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES (?,?,?,20,30,'2026-10-11T00:00:00Z','2026-10-11T00:00:00Z','shared',1)",
      id,
      author,
      "共有候補",
    ),
  );
  return id;
}
describe("復元の競合と連続進行", () => {
  it("フェーズをまたいで決定・下書きを復元し、さらに一つずつ戻れる", async () => {
    const { roomId, a, b } = await setup();
    const id = await seed(roomId);
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec(
        "INSERT INTO notes (id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES (?,?,?,0,0,'now','now','private',1)",
        crypto.randomUUID(),
        member.sub,
        "前フェーズの下書き",
      ),
    );
    await next(roomId, a, b);
    await next(roomId, a, b);
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec(
        "INSERT INTO decisions (phase,note_id,decided_by,decided_at,note_content) VALUES (1,?,?,?,?)",
        id,
        host.sub,
        "2026-10-11T00:00:00Z",
        "共有候補",
      ),
    );
    await next(roomId, a, b);
    const [first, peer] = await rollback(roomId, a, b);
    expect(first).toMatchObject({
      phase: { kind: "step", phase: 1, step: 5 },
      decision: { noteId: id },
    });
    expect(peer).toMatchObject({
      notes: expect.arrayContaining([
        expect.objectContaining({ content: "前フェーズの下書き" }),
      ]),
    });
    const [second] = await rollback(roomId, a, b);
    expect(second).toMatchObject({
      phase: { kind: "step", phase: 1, step: 4 },
      decision: null,
    });
    const [third] = await rollback(roomId, a, b);
    expect(third).toMatchObject({
      phase: { kind: "step", phase: 1, step: 3 },
      rollbackTarget: null,
    });
  });
  it("タイマーと発表者を復元して停止し、グループ・配置・票・採用を復元する", async () => {
    const { roomId, stub, a, b } = await setup();
    const id = await seed(roomId);
    const secondId = await seed(roomId);
    const groupId = crypto.randomUUID();
    await stub.setPhase({ kind: "step", phase: 1, step: 2 }, host.sub);
    await runInRoomDO(roomId, (_room, state) => {
      const sql = state.storage.sql;
      resetSharingForPhase(sql, { kind: "step", phase: 1, step: 2 }, true);
      sql.exec(
        "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES(?,?,?,'2026-10-11T00:00:00Z','2026-10-11T00:00:00Z')",
        groupId,
        "保存時のグループ",
        JSON.stringify([id, secondId]),
      );
      sql.exec(
        "UPDATE timer_state SET status='running',ends_at=?,remaining_ms=NULL,duration_ms=60000 WHERE id=1",
        Date.now() + 40000,
      );
      sql.exec(
        "UPDATE sharing_state SET state_json=json_set(state_json,'$.status','active','$.currentIndex',0,'$.startsAt',NULL) WHERE id=1",
      );
    });
    a.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    await Promise.all([until(a, "phase:updated"), until(b, "phase:updated")]);
    await runInRoomDO(roomId, (_room, state) => {
      const sql = state.storage.sql;
      sql.exec("UPDATE notes SET content='変更後',x=99,y=88 WHERE id=?", id);
      sql.exec("DELETE FROM groups");
      sql.exec(
        "INSERT INTO note_vote_stickers(id,note_id,user_id,kind,x,y,created_at) VALUES (?,?,?,'subjective',0.5,0.5,'now')",
        crypto.randomUUID(),
        id,
        member.sub,
      );
    });
    const [snapshot] = await rollback(roomId, a, b);
    expect(snapshot).toMatchObject({
      timer: { status: "paused", durationMs: 60000 },
      sharing: { status: "active", currentIndex: 0, startsAt: null },
      groups: [{ id: groupId, name: "保存時のグループ" }],
      notes: expect.arrayContaining([
        expect.objectContaining({
          id,
          content: "共有候補",
          x: 20,
          y: 30,
          dotVoteStickers: [],
        }),
      ]),
    });
    await runInRoomDO(roomId, async (room) => room.alarm());
    expect(
      await runInRoomDO(
        roomId,
        (_room, state) =>
          state.storage.sql.exec("SELECT status FROM timer_state").one().status,
      ),
    ).toBe("paused");
  });
  it.each([
    "phase:restart-writing",
    "phase:revote",
  ])("%sはそれ以前の復元履歴を破棄する", async (type) => {
    const { roomId, a, b } = await setup();
    await seed(roomId);
    await next(roomId, a, b);
    if (type === "phase:revote") await next(roomId, a, b);
    else
      await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
        { kind: "step", phase: 1, step: 3 },
        host.sub,
      );
    a.ws.send(
      JSON.stringify({ type, ...(await currentPhaseExpectation(roomId)) }),
    );
    const [snapshot] = await Promise.all([
      until(a, "snapshot"),
      until(b, "snapshot"),
    ]);
    expect(snapshot).toMatchObject({ rollbackTarget: null });
  });
  it("古いフェーズ世代とホスト世代は拒否し、現在ホストと会員は維持する", async () => {
    const { roomId, a, b } = await setup();
    await seed(roomId);
    const old = await currentPhaseExpectation(roomId);
    await next(roomId, a, b);
    a.ws.send(
      JSON.stringify({
        type: "phase:rollback",
        expectedHostRevision: 0,
        ...old,
      }),
    );
    expect(await a.next()).toMatchObject({ type: "error", code: "forbidden" });
    a.ws.send(
      JSON.stringify({
        type: "host:transfer",
        expectedHostRevision: 0,
        targetUserId: member.sub,
      }),
    );
    await Promise.all([until(a, "host:updated"), until(b, "host:updated")]);
    a.ws.send(
      JSON.stringify({
        type: "phase:rollback",
        expectedHostRevision: 0,
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    expect(await a.next()).toMatchObject({ type: "error", code: "forbidden" });
    const [newHost] = await rollback(roomId, b, a, 1);
    expect(newHost).toMatchObject({
      isHost: true,
      hostUserId: member.sub,
      hostRevision: 1,
      members: expect.arrayContaining([
        expect.objectContaining({ userId: host.sub }),
        expect.objectContaining({ userId: member.sub }),
      ]),
    });
  });
});
describe("復元後の会員情報と本文保存の世代", () => {
  it.each([
    "active",
    "complete",
  ] as const)("発表が%sでも現在の表示名と新規参加者を発表順へ保つ", async (status) => {
    const { roomId, stub, a, b } = await setup();
    await seed(roomId);
    await stub.setPhase({ kind: "step", phase: 1, step: 2 }, host.sub);
    await runInRoomDO(roomId, (_room, state) =>
      resetSharingForPhase(
        state.storage.sql,
        { kind: "step", phase: 1, step: 2 },
        true,
      ),
    );
    await runInRoomDO(roomId, (_room, state) => {
      const sql = state.storage.sql;
      const sharing = getSharingState(sql);
      if (!sharing) throw new Error("共有状態がありません");
      sharing.status = status;
      sharing.startsAt = null;
      if (status === "complete") {
        sharing.currentIndex = null;
        sharing.results = sharing.order.map(() => "done");
      }
      saveSharingState(sql, sharing);
    });
    a.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    await Promise.all([until(a, "phase:updated"), until(b, "phase:updated")]);
    const newcomer = crypto.randomUUID();
    await runInRoomDO(roomId, (_room, state) => {
      state.storage.sql.exec(
        "UPDATE members SET name='新しい名前' WHERE user_id=?",
        member.sub,
      );
      state.storage.sql.exec(
        "INSERT INTO members(user_id,name,color) VALUES(?,'途中参加','green')",
        newcomer,
      );
    });
    const [snapshot] = await rollback(roomId, a, b);
    expect(snapshot).toMatchObject({
      sharing: {
        status: status === "complete" ? "ready" : "active",
        order: expect.arrayContaining([
          expect.objectContaining({ userId: member.sub, name: "新しい名前" }),
          expect.objectContaining({ userId: newcomer, name: "途中参加" }),
        ]),
      },
    });
    if (status === "complete") {
      if (snapshot.type !== "snapshot" || !snapshot.sharing)
        throw new Error("復元した共有状態がありません");
      a.ws.send(
        JSON.stringify({
          type: "sharing:start",
          revision: snapshot.sharing.revision,
          durationMs: 60000,
        }),
      );
      expect(await until(a, "sharing:updated")).toMatchObject({
        sharing: {
          status: "active",
          currentIndex: 2,
          order: snapshot.sharing.order,
        },
      });
    }
  });
  it("戻す前の保存receiptをacceptedにせず旧ID再送で本文を戻さない", async () => {
    const { roomId, a, b } = await setup();
    const id = await seed(roomId);
    await next(roomId, a, b);
    const op = crypto.randomUUID();
    const revision = (await currentPhaseExpectation(roomId)).expectedRevision;
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec(
        "INSERT INTO note_content_receipts(operation_id,user_id,note_id,content_digest,expected_content_revision,expected_phase_revision,content_revision,created_at) VALUES(?,?,?,'old-digest',0,?,1,'now')",
        op,
        host.sub,
        id,
        revision,
      ),
    );
    await rollback(roomId, a, b);
    a.ws.send(JSON.stringify({ type: "note:content-status", operationId: op }));
    expect(await a.next()).toMatchObject({
      type: "note:content-status-result",
      status: "unknown",
    });
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
      { kind: "step", phase: 1, step: 2 },
      host.sub,
    );
    await startTimerForTest(roomId);
    a.ws.send(
      JSON.stringify({
        type: "note:update-content",
        operationId: op,
        noteId: id,
        content: "破棄された本文",
        expectedContentRevision: 0,
        expectedPhaseRevision: revision,
      }),
    );
    expect(await a.next()).toMatchObject({
      type: "error",
      code: "content-conflict",
    });
    expect(
      await runInRoomDO(
        roomId,
        (_room, state) =>
          state.storage.sql
            .exec("SELECT content FROM notes WHERE id=?", id)
            .one().content,
      ),
    ).toBe("共有候補");
  });
});
