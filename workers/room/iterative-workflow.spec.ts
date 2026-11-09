import { describe, expect, it } from "vitest";
import {
  RESULT_STEP_BY_PHASE,
  type RoomPhase,
  VOTING_STEP_BY_PHASE,
} from "../../contracts/phase";
import type { ServerMessage } from "../../contracts/room-protocol";
import {
  arrangeMembersReady,
  arrangeSharingComplete,
  connectRoomAs,
  createRoomAs,
  endTimerForTest,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  startTimerForTest,
} from "../test-helpers";
import { getPhaseRevision } from "./phase";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "host@example.com",
  name: "Host",
};
const member = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "member@example.com",
  name: "Member",
};
const candidateId = "33333333-3333-4333-8333-333333333333";
const excludedId = "44444444-4444-4444-8444-444444444444";
const draftId = "55555555-5555-4555-8555-555555555555";
const roomIdBySocket = new WeakMap<RoomSocket, string>();

async function setup(phase: RoomPhase) {
  const { roomId, inviteCode } = await createRoomAs(host);
  await joinRoomAs(member, inviteCode);
  await runInRoomDO(roomId, (room, state) => {
    room.setPhase(phase, host.sub);
    for (const [id, visibility, excluded] of [
      [candidateId, "shared", 0],
      [excludedId, "shared", 1],
      [draftId, "private", 0],
    ] as const) {
      state.storage.sql.exec(
        "INSERT INTO notes (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase, excluded) VALUES (?1, ?2, ?3, ?4, 'yellow', 40, 50, '2026-09-22', '2026-09-22', ?5, ?6)",
        id,
        host.sub,
        id,
        visibility,
        phase.kind === "step" ? phase.phase : 1,
        excluded,
      );
    }
  });
  const a = await connectRoomAs(host, roomId);
  const b = await connectRoomAs(member, roomId);
  const initial = await a.next();
  await b.next();
  roomIdBySocket.set(a, roomId);
  roomIdBySocket.set(b, roomId);
  return {
    roomId,
    a,
    b,
    initial,
    close: () => {
      a.close();
      b.close();
    },
  };
}

async function startTimer(
  room: Awaited<ReturnType<typeof setup>>,
): Promise<void> {
  const { initial } = room;
  if (initial.type === "snapshot" && initial.sharing?.status === "ready") {
    send(room.a, {
      type: "sharing:start",
      revision: initial.sharing.revision,
      durationMs: 60000,
    });
    for (const socket of [room.a, room.b]) {
      expect(await until(socket, "sharing:updated")).toMatchObject({
        type: "sharing:updated",
        timer: { status: "idle" },
      });
    }
    await runInRoomDO(room.roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE sharing_state SET state_json = json_set(state_json, '$.startsAt', ?1) WHERE id = 1",
        Date.now() - 1,
      );
      await instance.alarm();
    });
    for (const socket of [room.a, room.b]) {
      expect(await until(socket, "sharing:updated")).toMatchObject({
        type: "sharing:updated",
        timer: { status: "running" },
      });
    }
  } else {
    send(room.a, { type: "timer:start", durationMs: 60000 });
    for (const socket of [room.a, room.b]) {
      expect(await until(socket, "timer:updated")).toMatchObject({
        type: "timer:updated",
        timer: { status: "running" },
      });
    }
  }
}

async function until(
  socket: RoomSocket,
  type: ServerMessage["type"],
): Promise<ServerMessage> {
  for (let i = 0; i < 20; i++) {
    const message = await socket.next();

    if (message.type === "error" || message.type === type) return message;
  }
  throw new Error("応答が見つかりません");
}

function send(socket: RoomSocket, message: object) {
  socket.ws.send(JSON.stringify(message));
}
function transition(type: string, phase: RoomPhase, revision = 2) {
  return { type, expectedPhase: phase, expectedRevision: revision };
}

for (const phase of [1, 2, 3] as const) {
  describe(`フェーズ${phase} の反復`, () => {
    for (const step of phase === 2 ? [2] : [2, 3]) {
      it(`${step} から参加者が個人作業へ戻れ、下書き・配置・秘密・停止を再接続でも保持する`, async () => {
        const current: RoomPhase = { kind: "step", phase, step };
        const room = await setup(current);
        await startTimer(room);
        send(room.b, transition("phase:restart-writing", current));
        for (const socket of [room.a, room.b]) {
          expect(await until(socket, "phase:updated")).toMatchObject({
            type: "phase:updated",
            phase: { kind: "step", phase, step: 1 },
          });
        }
        const reconnect = await connectRoomAs(host, room.roomId);
        expect(await reconnect.next()).toMatchObject({
          type: "snapshot",
          phase: { kind: "step", phase, step: 1 },
          timer: { status: "idle" },
          notes: expect.arrayContaining([
            expect.objectContaining({ id: candidateId, x: 40, y: 50 }),
            expect.objectContaining({ id: draftId, visibility: "private" }),
          ]),
        });
        reconnect.close();
        const other = await connectRoomAs(member, room.roomId);
        const snapshot = await other.next();
        expect(
          snapshot.type === "snapshot" &&
            snapshot.notes.some((n) => n.id === draftId),
        ).toBe(false);
        other.close();
        send(room.a, {
          type: "note:update-content",
          operationId: crypto.randomUUID(),
          expectedContentRevision: 0,
          expectedPhaseRevision: 0,
          noteId: candidateId,
          content: "changed",
        });
        expect(await room.a.next()).toMatchObject({
          type: "error",
          code: "forbidden",
        });
        room.close();
      });
    }
    it("再投票は候補外も含む前回票と完了を消し、付箋は保持して今回票だけを届ける", async () => {
      const current: RoomPhase = {
        kind: "step",
        phase,
        step: RESULT_STEP_BY_PHASE[phase],
      };
      const room = await setup(current);
      await runInRoomDO(room.roomId, (_room, state) => {
        for (const noteId of [candidateId, excludedId]) {
          for (const user of [host, member]) {
            for (const kind of ["subjective", "objective"] as const) {
              state.storage.sql.exec(
                "INSERT INTO note_vote_stickers (id,note_id,user_id,kind,x,y,created_at) VALUES (?1,?2,?3,?4,0.2,0.3,'2026-09-22')",
                crypto.randomUUID(),
                noteId,
                user.sub,
                kind,
              );
            }
          }
        }
      });
      expect(
        await runInRoomDO(
          room.roomId,
          (_room, state) =>
            state.storage.sql
              .exec("SELECT COUNT(*) AS count FROM note_vote_stickers")
              .one().count,
        ),
      ).toBe(8);
      send(room.b, transition("phase:revote", current));
      expect(await until(room.a, "snapshot")).toMatchObject({
        type: "snapshot",
        completedVoterIds: [],
        notes: expect.arrayContaining([
          expect.objectContaining({
            id: excludedId,
            excluded: true,
            dotVoteStickers: [],
          }),
        ]),
      });
      expect(await until(room.a, "phase:updated")).toMatchObject({
        phase: { kind: "step", phase, step: VOTING_STEP_BY_PHASE[phase] },
      });
      expect(
        await runInRoomDO(
          room.roomId,
          (_room, state) =>
            state.storage.sql
              .exec("SELECT COUNT(*) AS count FROM note_vote_stickers")
              .one().count,
        ),
      ).toBe(0);
      send(room.a, {
        type: "note:vote",
        noteId: candidateId,
        kind: "subjective",
      });
      await until(room.a, "note:updated");
      const reconnect = await connectRoomAs(member, room.roomId);
      const snap = await reconnect.next();
      expect(
        snap.type === "snapshot" &&
          snap.notes.find((n) => n.id === candidateId),
      ).toMatchObject({
        dotVoteStickers: [],
        dotVotes: { subjective: { ownCount: 0 } },
      });
      if (snap.type === "snapshot")
        expect(snap.notes[0].dotVotes.subjective).not.toHaveProperty("count");
      reconnect.close();
      room.close();
    });
    it("採用後も参加者が採用済みと候補外を移動でき、候補の変更は拒否する", async () => {
      const current: RoomPhase = {
        kind: "step",
        phase,
        step: RESULT_STEP_BY_PHASE[phase],
      };
      const room = await setup(current);
      await startTimerForTest(room.roomId);
      send(room.b, { type: "note:move", noteId: candidateId, x: 55, y: 60 });
      expect(await room.b.next()).toMatchObject({
        type: "note:updated",
        note: { x: 55, y: 60 },
      });
      send(room.b, { type: "note:move", noteId: excludedId, x: 55, y: 60 });
      expect(await room.b.next()).toMatchObject({
        type: "note:updated",
        note: { excluded: true, x: 55, y: 60 },
      });
      await until(room.a, "note:updated");
      send(room.a, { type: "note:decide", noteId: candidateId });
      await until(room.a, "decision:updated");
      await until(room.b, "decision:updated");
      // 非作者の参加者でも共有付箋は動かせるが、未共有の付箋は動かせない。
      send(room.b, { type: "note:move", noteId: draftId, x: 80, y: 90 });
      expect(await room.b.next()).toMatchObject({ type: "error" });
      for (const noteId of [candidateId, excludedId]) {
        send(room.b, { type: "note:move", noteId, x: 80, y: 90 });
        for (const socket of [room.a, room.b]) {
          expect(await until(socket, "note:updated")).toMatchObject({
            note: { id: noteId, x: 80, y: 90 },
          });
        }
      }
      const reconnect = await connectRoomAs(member, room.roomId);
      expect(await reconnect.next()).toMatchObject({
        type: "snapshot",
        decision: { noteId: candidateId },
        notes: expect.arrayContaining([
          expect.objectContaining({ id: candidateId, x: 80, y: 90 }),
          expect.objectContaining({
            id: excludedId,
            x: 80,
            y: 90,
            excluded: true,
          }),
        ]),
      });
      reconnect.close();
      for (const action of [
        { type: "note:restore", noteId: excludedId },
        { type: "note:exclude", noteId: candidateId },
        transition("phase:revote", current),
      ]) {
        send(room.a, action);
        expect(await room.a.next()).toMatchObject({
          type: "error",
          code: "forbidden",
        });
      }
      room.close();
    });
    it("参加者が確定を取り消せ、票・下書き・候補・過去決定を保って再採用を全員と再接続へ反映する", async () => {
      const current: RoomPhase = {
        kind: "step",
        phase,
        step: RESULT_STEP_BY_PHASE[phase],
      };
      const room = await setup(current);
      await startTimerForTest(room.roomId);
      await runInRoomDO(room.roomId, (_room, state) => {
        state.storage.sql.exec(
          "INSERT INTO note_vote_stickers(id,note_id,user_id,kind,x,y,created_at) VALUES(?,?,?,'subjective',0.2,0.3,'2026-09-22')",
          crypto.randomUUID(),
          candidateId,
          host.sub,
        );
        if (phase > 1)
          state.storage.sql.exec(
            "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(1,?,'過去の課題',?,'2026-09-22')",
            crypto.randomUUID(),
            host.sub,
          );
      });
      send(room.a, { type: "note:decide", noteId: candidateId });
      expect(await until(room.a, "decision:updated")).toMatchObject({
        decision: { noteId: candidateId },
      });
      await until(room.b, "decision:updated");
      send(room.b, { type: "decision:clear", noteId: candidateId });
      for (const socket of [room.a, room.b]) {
        expect(await until(socket, "decision:updated")).toMatchObject({
          type: "decision:updated",
          decision: null,
        });
      }
      const reconnect = await connectRoomAs(host, room.roomId);
      const snapshot = await reconnect.next();
      expect(snapshot).toMatchObject({
        type: "snapshot",
        decision: null,
        phase: current,
        notes: expect.arrayContaining([
          expect.objectContaining({
            id: candidateId,
            x: 40,
            y: 50,
            dotVotes: expect.objectContaining({
              subjective: expect.objectContaining({ count: 1 }),
            }),
          }),
          expect.objectContaining({ id: excludedId, excluded: true }),
          expect.objectContaining({ id: draftId, visibility: "private" }),
        ]),
      });
      if (snapshot.type === "snapshot" && phase > 1)
        expect(snapshot.carryovers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ content: "過去の課題" }),
          ]),
        );
      reconnect.close();
      if (phase < 3) {
        send(room.a, transition("phase:next", current));
        expect(await until(room.a, "phase:updated")).toMatchObject({
          type: "error",
          code: "forbidden",
        });
      } else {
        send(room.a, { type: "outcome:publish" });
        expect(await room.a.next()).toMatchObject({
          type: "error",
          code: "forbidden",
        });
      }
      send(room.a, { type: "note:restore", noteId: excludedId });
      await until(room.a, "note:updated");
      await until(room.b, "note:updated");
      send(room.a, { type: "note:decide", noteId: excludedId });
      expect(await until(room.a, "decision:updated")).toMatchObject({
        decision: { noteId: excludedId },
      });
      expect(await until(room.b, "decision:updated")).toMatchObject({
        decision: { noteId: excludedId },
      });
      // 古いタブから届く前の決定の取消で、新しく採用した候補を消さない。
      send(room.a, { type: "decision:clear", noteId: candidateId });
      expect(await room.a.next()).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      const other = await connectRoomAs(member, room.roomId);
      const otherSnapshot = await other.next();
      expect(otherSnapshot).toMatchObject({ decision: { noteId: excludedId } });
      if (otherSnapshot.type === "snapshot")
        expect(otherSnapshot.notes.some((n) => n.id === draftId)).toBe(false);
      other.close();
      room.close();
    });
    it(`候補0件の初回投票を${phase === 2 ? "共有一巡後は許可" : "整理・評価後は拒否"}し、再投票と決定工程からの執筆戻りは拒否する`, async () => {
      const current: RoomPhase = {
        kind: "step",
        phase,
        step: VOTING_STEP_BY_PHASE[phase] - 1,
      };
      const room = await setup(current);
      await runInRoomDO(room.roomId, (_room, state) => {
        state.storage.sql.exec(
          "UPDATE notes SET excluded = 1 WHERE visibility = 'shared'",
        );
      });
      if (current.kind === "step" && current.step === 2)
        await arrangeSharingComplete(room.roomId);
      await arrangeMembersReady(room.roomId, [host.sub, member.sub]);
      send(room.a, transition("phase:next", current));
      if (current.kind === "step" && current.step === 2) {
        for (const socket of [room.a, room.b])
          expect(await until(socket, "phase:updated")).toMatchObject({
            phase: { kind: "step", phase, step: VOTING_STEP_BY_PHASE[phase] },
          });
      } else
        expect(await room.a.next()).toMatchObject({
          type: "error",
          code: "forbidden",
        });
      const result: RoomPhase = {
        kind: "step",
        phase,
        step: RESULT_STEP_BY_PHASE[phase],
      };
      const resultRevision = await runInRoomDO(
        room.roomId,
        async (room, state) => {
          await room.setPhase(result, host.sub);
          return getPhaseRevision(state.storage.sql);
        },
      );
      send(room.a, transition("phase:revote", result, resultRevision));
      expect(await until(room.a, "error")).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      send(room.a, transition("phase:restart-writing", result, resultRevision));
      expect(await until(room.a, "error")).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      room.close();
    });
  });
}

it("重複・競合の前進とABA遷移を拒否する", async () => {
  const current: RoomPhase = { kind: "step", phase: 1, step: 2 };
  const room = await setup(current);
  await arrangeSharingComplete(room.roomId);
  send(room.a, transition("phase:next", current));
  expect(await until(room.a, "phase:updated")).toMatchObject({
    phase: { kind: "step", phase: 1, step: 3 },
  });
  send(room.a, transition("phase:next", current));
  expect(await room.a.next()).toMatchObject({
    type: "error",
    code: "forbidden",
  });
  send(
    room.a,
    transition("phase:restart-writing", { kind: "step", phase: 1, step: 3 }, 3),
  );
  expect(await until(room.a, "phase:updated")).toMatchObject({
    type: "phase:updated",
  });
  await arrangeMembersReady(room.roomId, [host.sub, member.sub]);
  send(
    room.a,
    transition("phase:next", { kind: "step", phase: 1, step: 1 }, 4),
  );
  expect(await until(room.a, "phase:updated")).toMatchObject({
    type: "phase:updated",
  });
  send(room.a, transition("phase:next", current));
  expect(await room.a.next()).toMatchObject({
    type: "error",
    code: "forbidden",
  });
  room.close();
});

it.each([1, 2, 3] as const)(
  "フェーズ%i の投票中は保持された本人の下書きにも投票できない",
  async (phase) => {
    const room = await setup({
      kind: "step",
      phase,
      step: VOTING_STEP_BY_PHASE[phase],
    });
    for (const action of [
      { type: "note:vote", noteId: draftId, kind: "subjective" },
      {
        type: "note:vote-sticker:add",
        noteId: draftId,
        kind: "subjective",
        stickerId: crypto.randomUUID(),
        x: 0.3,
        y: 0.4,
      },
    ]) {
      send(room.a, action);
      expect(await room.a.next()).toMatchObject({
        type: "error",
        code: "forbidden",
      });
    }
    room.close();
  },
);

it.each([1, 2, 3] as const)(
  "フェーズ%i の下書きは同フェーズ内に残り、次フェーズ・最終完了で破棄される",
  async (phase) => {
    const result: RoomPhase = {
      kind: "step",
      phase,
      step: RESULT_STEP_BY_PHASE[phase],
    };
    const room = await setup(result);
    await startTimerForTest(room.roomId);
    send(room.a, { type: "note:decide", noteId: candidateId });
    expect(await until(room.a, "decision:updated")).toMatchObject({
      type: "decision:updated",
    });
    if (phase !== 3) {
      expect(
        await runInRoomDO(
          room.roomId,
          (_room, state) =>
            state.storage.sql
              .exec(
                "SELECT COUNT(*) AS count FROM notes WHERE visibility = 'private'",
              )
              .one().count,
        ),
      ).toBe(1);
      await endTimerForTest(room.roomId);
      send(room.a, transition("phase:next", result));
      expect(await until(room.a, "phase:updated")).toMatchObject({
        type: "phase:updated",
      });
    }
    if (phase === 3) {
      await runInRoomDO(room.roomId, (_room, state) => {
        for (const prior of [1, 2])
          state.storage.sql.exec(
            "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,'2026-09-22')",
            prior,
            crypto.randomUUID(),
            `決定${prior}`,
            host.sub,
          );
      });
      await endTimerForTest(room.roomId);
      send(room.a, { type: "outcome:publish" });
      expect(await until(room.a, "outcome:published")).toMatchObject({
        type: "outcome:published",
      });
    }
    expect(
      await runInRoomDO(
        room.roomId,
        (_room, state) =>
          state.storage.sql
            .exec(
              "SELECT COUNT(*) AS count FROM notes WHERE visibility = 'private'",
            )
            .one().count,
      ),
    ).toBe(0);
    if (phase === 3) {
      room.close();
      return;
    }
    const reconnect = await connectRoomAs(member, room.roomId);
    const snapshot = await reconnect.next();
    expect(snapshot.type).toBe("snapshot");
    if (snapshot.type === "snapshot") {
      expect(snapshot.notes.some((note) => note.id === draftId)).toBe(false);
      expect(
        snapshot.carryovers.some((value) => value.noteId === candidateId),
      ).toBe(true);
    }
    reconnect.close();
    room.close();
  },
);

it.each([1, 2, 3] as const)(
  "フェーズ%i は再投票を繰り返せ、別タブの古い再投票は今回票を消さない",
  async (phase) => {
    const result: RoomPhase = {
      kind: "step",
      phase,
      step: RESULT_STEP_BY_PHASE[phase],
    };
    const voting: RoomPhase = {
      kind: "step",
      phase,
      step: VOTING_STEP_BY_PHASE[phase],
    };
    const room = await setup(result);
    await startTimerForTest(room.roomId);
    const secondHost = await connectRoomAs(host, room.roomId);
    await secondHost.next();
    for (let round = 0; round < 2; round++) {
      const revision = 2 + round * 2;
      send(room.a, transition("phase:revote", result, revision));
      expect(await until(room.a, "phase:updated")).toMatchObject({
        type: "phase:updated",
      });
      expect(await until(room.b, "phase:updated")).toMatchObject({
        type: "phase:updated",
      });
      expect(await until(secondHost, "phase:updated")).toMatchObject({
        type: "phase:updated",
      });
      // phase:revote はタイマーをリセットするため、投票の振る舞いを検証する前に再開する。
      await startTimerForTest(room.roomId);
      for (const socket of [room.a, room.b]) {
        for (const kind of [
          "subjective",
          "objective",
          "objective",
          "objective",
        ]) {
          send(socket, { type: "note:vote", noteId: candidateId, kind });
          expect(await until(socket, "note:updated")).toMatchObject({
            type: "note:updated",
          });
        }
      }
      send(secondHost, transition("phase:revote", result, 2));
      expect(await until(secondHost, "error")).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      expect(
        await runInRoomDO(
          room.roomId,
          (_room, state) =>
            state.storage.sql
              .exec("SELECT COUNT(*) AS count FROM note_vote_stickers")
              .one().count,
        ),
      ).toBe(8);
      await endTimerForTest(room.roomId);
      send(room.a, transition("phase:next", voting, revision + 1));
      expect(await until(room.a, "phase:updated")).toMatchObject({
        type: "phase:updated",
        phase: result,
      });
      expect(await until(room.b, "phase:updated")).toMatchObject({
        type: "phase:updated",
      });
      expect(await until(secondHost, "phase:updated")).toMatchObject({
        type: "phase:updated",
      });
      const reconnect = await connectRoomAs(host, room.roomId);
      const snapshot = await reconnect.next();
      expect(
        snapshot.type === "snapshot" &&
          snapshot.notes.find((note) => note.id === candidateId),
      ).toMatchObject({
        x: 40,
        y: 50,
        content: candidateId,
        authorId: host.sub,
        color: "yellow",
        excluded: false,
        dotVotes: { subjective: { count: 2 }, objective: { count: 6 } },
      });
      reconnect.close();
    }
    secondHost.close();
    room.close();
  },
);

it.each([
  { type: "phase:next", from: 2, intermediate: 3, to: 4 },
  { type: "phase:restart-writing", from: 2, intermediate: 1, to: 2 },
  { type: "phase:revote", from: 5, intermediate: 4, to: 5 },
])(
  "タイマー停止中の $type と後続遷移はphaseとrevisionを順番どおり全員に届ける",
  async ({ type, from, intermediate, to }) => {
    const current: RoomPhase = { kind: "step", phase: 1, step: from };
    const middle: RoomPhase = { kind: "step", phase: 1, step: intermediate };
    const final: RoomPhase = { kind: "step", phase: 1, step: to };
    const room = await setup(current);
    await startTimer(room);
    if (type === "phase:next") await arrangeSharingComplete(room.roomId);
    // 次の作業の完了条件を満たしてから後続の前進を送る。
    send(room.a, transition(type, current));

    for (const socket of [room.a, room.b]) {
      expect(await until(socket, "phase:updated")).toEqual({
        type: "phase:updated",
        groupRevision: expect.any(Number),
        mapRevision: expect.any(Number),
        phase: middle,
        phaseRevision: 3,
        rollbackTarget: type === "phase:next" ? current : null,
      });
    }
    await arrangeMembersReady(room.roomId, [host.sub, member.sub]);
    if (type === "phase:revote") {
      await runInRoomDO(room.roomId, (_room, state) => {
        for (const user of [host, member])
          for (const kind of ["subjective", "objective"])
            for (let i = 0; i < (kind === "subjective" ? 1 : 3); i++)
              state.storage.sql.exec(
                "INSERT INTO note_vote_stickers(id,note_id,user_id,kind,x,y,created_at) VALUES(?,?,?,?,0.2,0.3,'2026-09-22')",
                crypto.randomUUID(),
                candidateId,
                user.sub,
                kind,
              );
      });
    }
    await endTimerForTest(room.roomId);
    send(room.a, transition("phase:next", middle, 3));
    for (const socket of [room.a, room.b]) {
      expect(await until(socket, "phase:updated")).toEqual({
        type: "phase:updated",
        groupRevision: expect.any(Number),
        mapRevision: expect.any(Number),
        phase: final,
        phaseRevision: 4,
        rollbackTarget: middle,
      });
    }
    const reconnect = await connectRoomAs(host, room.roomId);
    expect(await reconnect.next()).toMatchObject({
      phase: final,
      phaseRevision: 4,
      timer: { status: "idle" },
    });
    reconnect.close();
    room.close();
  },
);

it.each(["グループ", "学び合い"])(
  "1-3のまとまり（%s）は1-4への進行と再接続後も所属を保持する",
  async (name) => {
    const current: RoomPhase = { kind: "step", phase: 1, step: 3 };
    const room = await setup(current);
    try {
      if (name !== "グループ") {
        await runInRoomDO(room.roomId, (_room, state) => {
          state.storage.sql.exec(
            "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES(?,?,?,'now','now')",
            draftId,
            name,
            JSON.stringify([candidateId, excludedId]),
          );
        });
      }
      await arrangeMembersReady(room.roomId, [host.sub, member.sub]);
      send(room.a, transition("phase:next", current));
      for (const socket of [room.a, room.b]) {
        expect(await until(socket, "snapshot")).toMatchObject({
          groups: [
            expect.objectContaining({
              name,
              noteIds: expect.arrayContaining([candidateId, excludedId]),
            }),
          ],
        });
        expect(await until(socket, "phase:updated")).toMatchObject({
          phase: { kind: "step", phase: 1, step: 4 },
        });
      }
      const reconnect = await connectRoomAs(member, room.roomId);
      const snapshot = await reconnect.next();
      expect(snapshot).toMatchObject({
        groups: [
          expect.objectContaining({
            name,
            noteIds: expect.arrayContaining([candidateId, excludedId]),
          }),
        ],
      });
      if (snapshot.type === "snapshot") {
        expect(snapshot.groups?.[0].noteIds).toHaveLength(2);
        expect(snapshot.groups?.[0].noteIds).not.toContain(draftId);
        if (name !== "グループ") expect(snapshot.groups?.[0].id).toBe(draftId);
      }
      reconnect.close();
    } finally {
      room.close();
    }
  },
);
