import { describe, expect, it } from "vitest";
import {
  RESULT_STEP_BY_PHASE,
  type RoomPhase,
  VOTING_STEP_BY_PHASE,
} from "../../contracts/phase";
import type { ServerMessage } from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
} from "../test-helpers";

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
      it(`${step} からホストだけ個人作業へ戻れ、下書き・配置・秘密・停止を再接続でも保持する`, async () => {
        const current: RoomPhase = { kind: "step", phase, step };
        const room = await setup(current);
        send(room.b, transition("phase:restart-writing", current));
        expect(await room.b.next()).toMatchObject({
          type: "error",
          code: "forbidden",
        });
        send(room.a, { type: "timer:start", durationMs: 60000 });
        await until(room.a, "timer:updated");
        send(room.a, transition("phase:restart-writing", current));
        expect(await until(room.a, "phase:updated")).toMatchObject({
          type: "phase:updated",
          phase: { kind: "step", phase, step: 1 },
        });
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
      send(room.b, transition("phase:revote", current));
      expect(await room.b.next()).toMatchObject({
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
      send(room.a, transition("phase:revote", current));
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
    it("決定中の候補は参加者が移動でき、除外候補・確定後の変更は拒否する", async () => {
      const current: RoomPhase = {
        kind: "step",
        phase,
        step: RESULT_STEP_BY_PHASE[phase],
      };
      const room = await setup(current);
      send(room.b, { type: "note:move", noteId: candidateId, x: 55, y: 60 });
      expect(await room.b.next()).toMatchObject({
        type: "note:updated",
        note: { x: 55, y: 60 },
      });
      send(room.b, { type: "note:move", noteId: excludedId, x: 55, y: 60 });
      expect(await room.b.next()).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      await until(room.a, "note:updated");
      send(room.a, { type: "note:decide", noteId: candidateId });
      await until(room.a, "decision:updated");
      for (const action of [
        { type: "decision:clear" },
        { type: "note:restore", noteId: excludedId },
        { type: "note:exclude", noteId: candidateId },
        { type: "note:move", noteId: candidateId, x: 1, y: 1 },
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
    it("候補0件の初回投票・再投票は拒否し、決定後から個人作業へ戻れない", async () => {
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
      send(room.a, transition("phase:next", current));
      expect(await room.a.next()).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      const result: RoomPhase = {
        kind: "step",
        phase,
        step: RESULT_STEP_BY_PHASE[phase],
      };
      await runInRoomDO(room.roomId, (room) => room.setPhase(result, host.sub));
      send(room.a, transition("phase:revote", result, 3));
      expect(await room.a.next()).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      send(room.a, transition("phase:restart-writing", result, 3));
      expect(await room.a.next()).toMatchObject({
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

it.each([
  1, 2, 3,
] as const)("フェーズ%i の投票中は保持された本人の下書きにも投票できない", async (phase) => {
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
});

it.each([
  1, 2, 3,
] as const)("フェーズ%i の下書きは同フェーズ内に残り、次フェーズ・最終完了で破棄される", async (phase) => {
  const result: RoomPhase = {
    kind: "step",
    phase,
    step: RESULT_STEP_BY_PHASE[phase],
  };
  const room = await setup(result);
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
    send(room.a, transition("phase:next", result));
    expect(await until(room.a, "phase:updated")).toMatchObject({
      type: "phase:updated",
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
  const reconnect = await connectRoomAs(member, room.roomId);
  const snapshot = await reconnect.next();
  expect(snapshot.type).toBe("snapshot");
  if (snapshot.type === "snapshot") {
    expect(snapshot.notes.some((note) => note.id === draftId)).toBe(false);
    if (phase === 3) expect(snapshot.decision?.noteId).toBe(candidateId);
    else
      expect(
        snapshot.carryovers.some((value) => value.noteId === candidateId),
      ).toBe(true);
  }
  reconnect.close();
  room.close();
});

it.each([
  1, 2, 3,
] as const)("フェーズ%i は再投票を繰り返せ、別タブの古い再投票は今回票を消さない", async (phase) => {
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
});

it.each([
  { type: "phase:next", from: 2, intermediate: 3, to: 4 },
  { type: "phase:restart-writing", from: 2, intermediate: 1, to: 2 },
  { type: "phase:revote", from: 5, intermediate: 4, to: 5 },
])("タイマー停止中の $type と後続遷移はphaseとrevisionを順番どおり全員に届ける", async ({
  type,
  from,
  intermediate,
  to,
}) => {
  const current: RoomPhase = { kind: "step", phase: 1, step: from };
  const middle: RoomPhase = { kind: "step", phase: 1, step: intermediate };
  const final: RoomPhase = { kind: "step", phase: 1, step: to };
  const room = await setup(current);
  send(room.a, { type: "timer:start", durationMs: 60000 });
  expect(await until(room.a, "timer:updated")).toMatchObject({
    type: "timer:updated",
  });
  expect(await until(room.b, "timer:updated")).toMatchObject({
    type: "timer:updated",
  });
  // 最初の応答を待たず、ストレージI/Oでyieldする遷移に続けて送る。
  send(room.a, transition(type, current));
  send(room.a, { ...transition("phase:next", middle, 3), force: true });
  for (const socket of [room.a, room.b]) {
    const received: ServerMessage[] = [];
    while (
      received.filter((message) => message.type === "phase:updated").length < 2
    ) {
      const message = await socket.next();
      expect(message.type).not.toBe("error");
      received.push(message);
    }
    expect(
      received.filter((message) => message.type === "phase:updated"),
    ).toEqual([
      { type: "phase:updated", phase: middle, phaseRevision: 3 },
      { type: "phase:updated", phase: final, phaseRevision: 4 },
    ]);
    for (const message of received) {
      if (message.type !== "snapshot") continue;
      expect(message.phase).toEqual(
        message.phaseRevision === 3 ? middle : final,
      );
      expect(message.timer).toEqual({ status: "idle" });
    }
  }
  const reconnect = await connectRoomAs(host, room.roomId);
  expect(await reconnect.next()).toMatchObject({
    phase: final,
    phaseRevision: 4,
    timer: { status: "idle" },
  });
  reconnect.close();
  room.close();
});
