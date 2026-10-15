import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import {
  parseServerMessage,
  type ServerMessage,
} from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  initializeTestRoom,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  startTimerForTest,
} from "../test-helpers";
import { HOST_ID_HEADER, USER_ID_HEADER } from "./room-do";

const hostId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

async function untilType(
  socket: RoomSocket,
  type: ServerMessage["type"],
): Promise<ServerMessage> {
  for (let i = 0; i < 30; i++) {
    const message = await socket.next();
    if (message.type === type) return message;
  }
  throw new Error(`応答 ${type} が見つかりません`);
}

describe("本文保存を待たない進行", () => {
  it("個人から共有は時計を進めず本文ACKを待たず確定する", async () => {
    const name = "phase-save-window";
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(name));
    await initializeTestRoom(stub, hostId, "Host");
    await stub.setPhase(buildPhaseStep(1), hostId);
    const response = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        "X-Idea-Boost-Session-Expires-At": String(
          Math.floor(Date.now() / 1000) + 600,
        ),
        [USER_ID_HEADER]: hostId,
        [HOST_ID_HEADER]: hostId,
      },
    });
    const socket = response.webSocket;
    if (!socket) throw new Error("socket missing");
    socket.accept();
    await new Promise<void>((resolve) =>
      socket.addEventListener("message", () => resolve(), { once: true }),
    );
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now());
    try {
      const updated = new Promise<ServerMessage | null>((resolve) =>
        socket.addEventListener(
          "message",
          (event) => resolve(parseServerMessage(event.data)),
          { once: true },
        ),
      );
      socket.send(
        JSON.stringify({
          type: "phase:next",
          ...(await currentPhaseExpectation(name)),
        }),
      );
      expect(await updated).toMatchObject({
        type: "snapshot",
        phase: buildPhaseStep(2),
        pendingPhaseTransition: null,
      });
      expect(await stub.getPhase()).toEqual(buildPhaseStep(2));
      expect(
        await runInRoomDO(name, (_room, state) =>
          state.storage.sql
            .exec("SELECT * FROM pending_phase_transition")
            .toArray(),
        ),
      ).toEqual([]);
    } finally {
      clock.mockRestore();
      socket.close();
    }
  });

  it("旧予約が残ったalarmでも二重進行せず他のタイマー予約を維持する", async () => {
    const name = "legacy-phase-alarm";
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(name));
    await initializeTestRoom(stub, hostId, "Host");
    await stub.setPhase(buildPhaseStep(3), hostId);
    await runInRoomDO(name, async (instance, state) => {
      const sql = state.storage.sql;
      const revision = sql
        .exec("SELECT phase_revision FROM room_state WHERE id=1")
        .one().phase_revision;
      const endsAt = Date.now() + 60000;
      sql.exec(
        "UPDATE timer_state SET status='running', duration_ms=60000, ends_at=?1 WHERE id=1",
        endsAt,
      );
      sql.exec(
        "INSERT INTO pending_phase_transition(id,transition_id,requested_by,action,expected_phase,expected_revision,force,deadline_at) VALUES(1,'old',?1,'next',?2,?3,0,0)",
        hostId,
        JSON.stringify(buildPhaseStep(3)),
        revision,
      );
      await instance.alarm();
      await instance.alarm();
      expect(instance.getPhase()).toEqual(buildPhaseStep(3));
      expect(
        sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
          .phase_revision,
      ).toBe(revision);
      expect(
        sql.exec("SELECT * FROM pending_phase_transition").toArray(),
      ).toEqual([]);
      expect(instance.getTimerState()).toMatchObject({
        status: "running",
        endsAt,
      });
      // 成果保存の再試行alarmもあるため、timerより先の予約も許容する。
      expect(await state.storage.getAlarm()).toBeLessThanOrEqual(endsAt);
    });
  });

  it("次のステップ確定時に最新本文で共有付箋だけを判定し、両参加者へ反映する", async () => {
    const host = {
      sub: hostId,
      name: "Host",
      email: "host@example.test",
    };
    const member = {
      sub: memberId,
      name: "Member",
      email: "member@example.test",
    };
    const { roomId, inviteCode } = await createRoomAs(host);
    await joinRoomAs(member, inviteCode);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    await stub.setPhase(buildPhaseStep(2), hostId);
    await startTimerForTest(roomId);

    const noteIds = {
      ascii: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      fullWidth: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      newlines: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      savedDuringWait: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      nonEmpty: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      private: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    };
    const now = new Date().toISOString();
    await runInRoomDO(roomId, (_room, state) => {
      for (const [id, content, visibility] of [
        [noteIds.ascii, "   ", "shared"],
        [noteIds.fullWidth, "\u3000", "shared"],
        [noteIds.newlines, "\n\r\n", "shared"],
        [noteIds.savedDuringWait, " \t\u3000\n ", "shared"],
        [noteIds.nonEmpty, "  前後の空白は保持する \n", "shared"],
        [noteIds.private, " \u3000\n", "private"],
      ] as const) {
        state.storage.sql.exec(
          `INSERT INTO notes
             (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, 'yellow', 40, 50, 1, ?5, ?5)`,
          id,
          hostId,
          content,
          visibility,
          now,
        );
      }
    });

    const ownerSocket = await connectRoomAs(host, roomId);
    const memberSocket = await connectRoomAs(member, roomId);
    expect((await ownerSocket.next()).type).toBe("snapshot");
    expect((await memberSocket.next()).type).toBe("snapshot");
    const expectation = await currentPhaseExpectation(roomId);

    memberSocket.ws.send(
      JSON.stringify({
        type: "note:update-content",
        operationId: crypto.randomUUID(),
        noteId: noteIds.savedDuringWait,
        content: "  進行前に確定した本文 \n",
        expectedContentRevision: 0,
        expectedPhaseRevision: expectation.expectedRevision,
      }),
    );
    await untilType(memberSocket, "note:content-saved");
    await untilType(ownerSocket, "note:updated");

    ownerSocket.ws.send(JSON.stringify({ type: "phase:next", ...expectation }));
    const [ownerSnapshot, memberSnapshot] = await Promise.all([
      untilType(ownerSocket, "snapshot"),
      untilType(memberSocket, "snapshot"),
    ]);
    await Promise.all([
      untilType(ownerSocket, "phase:updated"),
      untilType(memberSocket, "phase:updated"),
    ]);
    expect(ownerSnapshot.type).toBe("snapshot");
    expect(memberSnapshot.type).toBe("snapshot");
    if (ownerSnapshot.type !== "snapshot" || memberSnapshot.type !== "snapshot")
      throw new Error("進行後のsnapshotが見つかりません");

    for (const emptyId of [
      noteIds.ascii,
      noteIds.fullWidth,
      noteIds.newlines,
    ]) {
      expect(ownerSnapshot.notes.some((note) => note.id === emptyId)).toBe(
        false,
      );
      expect(memberSnapshot.notes.some((note) => note.id === emptyId)).toBe(
        false,
      );
    }
    expect(ownerSnapshot.notes).toContainEqual(
      expect.objectContaining({
        id: noteIds.savedDuringWait,
        content: "  進行前に確定した本文 \n",
      }),
    );
    expect(memberSnapshot.notes).toContainEqual(
      expect.objectContaining({
        id: noteIds.savedDuringWait,
        content: "  進行前に確定した本文 \n",
      }),
    );
    expect(ownerSnapshot.notes).toContainEqual(
      expect.objectContaining({
        id: noteIds.nonEmpty,
        content: "  前後の空白は保持する \n",
      }),
    );
    expect(
      ownerSnapshot.notes.some((note) => note.id === noteIds.private),
    ).toBe(false);
    expect(
      memberSnapshot.notes.some((note) => note.id === noteIds.private),
    ).toBe(false);
    ownerSocket.close();
    memberSocket.close();
  });

  it.each([
    { phase: 1, name: "課題" },
    { phase: 2, name: "問い" },
    { phase: 3, name: "アイデア" },
  ] as const)("$nameの個人作業から共有へ進むとき空白のマイ付箋だけを削除し本文のある下書きを保持する", async ({
    phase,
  }) => {
    const host = {
      sub: hostId,
      name: "Host",
      email: "host@example.test",
    };
    const member = {
      sub: memberId,
      name: "Member",
      email: "member@example.test",
    };
    const { roomId, inviteCode } = await createRoomAs(host);
    await joinRoomAs(member, inviteCode);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    await stub.setPhase(buildPhaseStep(1, phase), hostId);

    const noteIds = {
      ownerEmpty: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      ownerBlank: "dddddddd-dddd-4ddd-8ddd-ddddddddddd5",
      ownerContent: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
      memberEmpty: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
      memberContent: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
    };
    await runInRoomDO(roomId, (_room, state) => {
      for (const [id, authorId, content] of [
        [noteIds.ownerEmpty, hostId, " \t\u3000\n "],
        [noteIds.ownerBlank, hostId, ""],
        [noteIds.ownerContent, hostId, "アイデア案"],
        [noteIds.memberEmpty, memberId, "\u3000\n"],
        [noteIds.memberContent, memberId, "別のアイデア案"],
      ] as const) {
        state.storage.sql.exec(
          `INSERT INTO notes
             (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at)
           VALUES (?1, ?2, ?3, 'private', 'yellow', 40, 50, ?4, ?5, ?5)`,
          id,
          authorId,
          content,
          phase,
          new Date().toISOString(),
        );
      }
    });

    const ownerSocket = await connectRoomAs(host, roomId);
    const memberSocket = await connectRoomAs(member, roomId);
    expect((await ownerSocket.next()).type).toBe("snapshot");
    expect((await memberSocket.next()).type).toBe("snapshot");
    // 古い進行要求では空白の下書きも削除しない。
    const before = await currentPhaseExpectation(roomId);
    ownerSocket.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...before,
        expectedRevision: before.expectedRevision + 1,
      }),
    );
    expect(await untilType(ownerSocket, "error")).toMatchObject({
      code: "forbidden",
    });
    expect(
      await runInRoomDO(roomId, (_room, state) =>
        state.storage.sql.exec("SELECT id FROM notes").toArray(),
      ),
    ).toHaveLength(5);
    ownerSocket.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );

    const [ownerSnapshot, memberSnapshot] = await Promise.all([
      untilType(ownerSocket, "snapshot"),
      untilType(memberSocket, "snapshot"),
    ]);
    await Promise.all([
      untilType(ownerSocket, "phase:updated"),
      untilType(memberSocket, "phase:updated"),
    ]);
    expect(ownerSnapshot.type).toBe("snapshot");
    expect(memberSnapshot.type).toBe("snapshot");
    if (ownerSnapshot.type !== "snapshot" || memberSnapshot.type !== "snapshot")
      throw new Error("進行後のsnapshotが見つかりません");

    expect(ownerSnapshot.phase).toEqual(buildPhaseStep(2, phase));
    expect(memberSnapshot.phase).toEqual(buildPhaseStep(2, phase));
    expect(
      ownerSnapshot.notes.some((note) => note.id === noteIds.ownerEmpty),
    ).toBe(false);
    expect(
      memberSnapshot.notes.some((note) => note.id === noteIds.memberEmpty),
    ).toBe(false);
    expect(
      ownerSnapshot.notes.some(({ id }) => id === noteIds.ownerBlank),
    ).toBe(false);
    expect(ownerSnapshot.notes).toContainEqual(
      expect.objectContaining({
        id: noteIds.ownerContent,
        content: "アイデア案",
      }),
    );
    expect(memberSnapshot.notes).toContainEqual(
      expect.objectContaining({
        id: noteIds.memberContent,
        content: "別のアイデア案",
      }),
    );
    const persisted = await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec("SELECT id FROM notes ORDER BY id").toArray(),
    );
    expect(persisted).toEqual([
      { id: noteIds.ownerContent },
      { id: noteIds.memberContent },
    ]);
    const reconnectedDuringSharing = await connectRoomAs(member, roomId);
    expect(await reconnectedDuringSharing.next()).toMatchObject({
      phase: buildPhaseStep(2, phase),
      notes: [expect.objectContaining({ id: noteIds.memberContent })],
    });
    reconnectedDuringSharing.close();
    // 旧工程の要求は拒否し、5秒後の通信回復でも同じ共有工程の本人本文は保存できる。
    await startTimerForTest(roomId);
    const current = await currentPhaseExpectation(roomId);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5000);
    try {
      memberSocket.ws.send(
        JSON.stringify({
          type: "note:update-content",
          noteId: noteIds.memberContent,
          operationId: crypto.randomUUID(),
          content: "遅れて届く本人本文",
          expectedContentRevision: 0,
          expectedPhaseRevision: current.expectedRevision - 1,
        }),
      );
      expect(await untilType(memberSocket, "error")).toMatchObject({
        code: "content-conflict",
      });
      memberSocket.ws.send(
        JSON.stringify({
          type: "note:update-content",
          noteId: noteIds.memberContent,
          operationId: crypto.randomUUID(),
          content: "遅れて届く本人本文",
          expectedContentRevision: 0,
          expectedPhaseRevision: current.expectedRevision,
        }),
      );
      expect(await untilType(memberSocket, "note:content-saved")).toMatchObject(
        { contentRevision: 1 },
      );
      // 他人の個人付箋を書き換えたり共有したりできない。
      ownerSocket.ws.send(
        JSON.stringify({
          type: "note:update-content",
          noteId: noteIds.memberContent,
          operationId: crypto.randomUUID(),
          content: "他人からの本文",
          expectedContentRevision: 1,
          expectedPhaseRevision: current.expectedRevision,
        }),
      );
      expect(await untilType(ownerSocket, "error")).toMatchObject({
        code: "forbidden",
      });
      // 問いの共有→投票に必要な候補だけを追加する。
      await runInRoomDO(roomId, (_room, state) =>
        state.storage.sql.exec(
          "UPDATE notes SET visibility='shared' WHERE id=?1",
          noteIds.ownerContent,
        ),
      );
      ownerSocket.ws.send(JSON.stringify({ type: "phase:next", ...current }));
      const nextSnapshot = await untilType(ownerSocket, "snapshot");
      expect(nextSnapshot).toMatchObject({ phase: buildPhaseStep(3, phase) });
      if (nextSnapshot.type !== "snapshot") throw new Error("snapshot missing");
      expect(
        nextSnapshot.notes.some(({ id }) => id === noteIds.ownerEmpty),
      ).toBe(false);
      await untilType(ownerSocket, "phase:updated");
      const memberNext = await untilType(memberSocket, "snapshot");
      expect(memberNext).toMatchObject({
        notes: expect.arrayContaining([
          expect.objectContaining({
            id: noteIds.memberContent,
            content: "遅れて届く本人本文",
          }),
        ]),
      });
      await untilType(memberSocket, "phase:updated");
      memberSocket.ws.send(
        JSON.stringify({
          type: "note:update-content",
          noteId: noteIds.memberContent,
          operationId: crypto.randomUUID(),
          content: "非編集工程からの本文",
          expectedContentRevision: 1,
          expectedPhaseRevision: current.expectedRevision + 1,
        }),
      );
      expect(await untilType(memberSocket, "error")).toMatchObject({
        code: "forbidden",
      });
      const reconnected = await connectRoomAs(host, roomId);
      const reconnectedSnapshot = await reconnected.next();
      expect(reconnectedSnapshot).toMatchObject({
        phase: buildPhaseStep(3, phase),
      });
      if (reconnectedSnapshot.type !== "snapshot")
        throw new Error("snapshot missing");
      expect(
        reconnectedSnapshot.notes.some(({ id }) => id === noteIds.ownerEmpty),
      ).toBe(false);
      expect(
        reconnectedSnapshot.notes.some(({ id }) => id === noteIds.memberEmpty),
      ).toBe(false);
      reconnected.close();
    } finally {
      clock.mockRestore();
    }
    ownerSocket.close();
    memberSocket.close();
  });

  it("進行が成立しない場合や前の工程へ戻る場合は共有付箋を削除しない", async () => {
    const host = {
      sub: hostId,
      name: "Host",
      email: "host@example.test",
    };
    const { roomId } = await createRoomAs(host);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    await stub.setPhase(buildPhaseStep(2), hostId);
    const emptyNoteId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await runInRoomDO(roomId, (_room, state) => {
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at)
         VALUES (?1, ?2, ' \u3000\n ', 'shared', 'yellow', 40, 50, 1, ?3, ?3)`,
        emptyNoteId,
        hostId,
        new Date().toISOString(),
      );
    });
    const ownerSocket = await connectRoomAs(host, roomId);
    expect((await ownerSocket.next()).type).toBe("snapshot");

    const expectation = await currentPhaseExpectation(roomId);
    ownerSocket.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...expectation,
        expectedRevision: expectation.expectedRevision + 1,
      }),
    );
    expect(await untilType(ownerSocket, "error")).toMatchObject({
      code: "forbidden",
    });

    ownerSocket.ws.send(
      JSON.stringify({ type: "phase:restart-writing", ...expectation }),
    );
    await untilType(ownerSocket, "snapshot");
    expect(await untilType(ownerSocket, "phase:updated")).toMatchObject({
      phase: buildPhaseStep(1),
    });
    const remaining = await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql
        .exec("SELECT content FROM notes WHERE id = ?1", emptyNoteId)
        .toArray(),
    );
    expect(remaining).toEqual([{ content: " \u3000\n " }]);
    ownerSocket.close();
  });

  it("空の共有付箋だけでは投票へ進まず、失敗時に付箋を保持する", async () => {
    const host = {
      sub: hostId,
      name: "Host",
      email: "host@example.test",
    };
    const { roomId } = await createRoomAs(host);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    await stub.setPhase(buildPhaseStep(2, 2), hostId);
    const emptyNoteId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await runInRoomDO(roomId, (_room, state) => {
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at)
         VALUES (?1, ?2, ' \u3000\n ', 'shared', 'yellow', 40, 50, 2, ?3, ?3)`,
        emptyNoteId,
        hostId,
        new Date().toISOString(),
      );
    });
    const ownerSocket = await connectRoomAs(host, roomId);
    expect((await ownerSocket.next()).type).toBe("snapshot");
    ownerSocket.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    expect(await ownerSocket.next()).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    const remaining = await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql
        .exec("SELECT content FROM notes WHERE id = ?1", emptyNoteId)
        .toArray(),
    );
    expect(remaining).toEqual([{ content: " \u3000\n " }]);
    ownerSocket.close();
  });
});

describe("整理・評価の自動タイマー", () => {
  it.each([
    [1, 240000],
    [3, 420000],
  ] as const)("phase %iの共有から進む確定時だけ開始する", async (phase, durationMs) => {
    const host = { sub: hostId, name: "Host", email: "host@example.test" };
    const { roomId } = await createRoomAs(host);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    await stub.setPhase(buildPhaseStep(2, phase), hostId);
    const socket = await connectRoomAs(host, roomId);
    await socket.next();
    const expectation = await currentPhaseExpectation(roomId);
    socket.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...expectation,
        expectedRevision: expectation.expectedRevision + 1,
      }),
    );
    await untilType(socket, "error");
    const rejected = await connectRoomAs(host, roomId);
    expect(await rejected.next()).toMatchObject({
      phase: buildPhaseStep(2, phase),
      timer: { status: "idle" },
    });
    rejected.close();
    socket.ws.send(JSON.stringify({ type: "phase:next", ...expectation }));
    const snapshot = await untilType(socket, "snapshot");
    expect(snapshot).toMatchObject({
      phase: buildPhaseStep(3, phase),
      timer: { status: "running", durationMs, endsAt: expect.any(Number) },
    });
    socket.ws.send(JSON.stringify({ type: "phase:next", ...expectation }));
    await untilType(socket, "phase:updated");
    await untilType(socket, "error");
    const stillRunning = await connectRoomAs(host, roomId);
    expect(await stillRunning.next()).toMatchObject({
      timer: snapshot.type === "snapshot" ? snapshot.timer : undefined,
    });
    stillRunning.close();
    socket.close();
    const reconnected = await connectRoomAs(host, roomId);
    expect(await reconnected.next()).toMatchObject({
      timer: snapshot.type === "snapshot" ? snapshot.timer : undefined,
    });
    reconnected.ws.send(
      JSON.stringify({
        type: "phase:restart-writing",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    await untilType(reconnected, "phase:updated");
    reconnected.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    await untilType(reconnected, "phase:updated");
    reconnected.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    const reentered = await untilType(reconnected, "snapshot");
    expect(reentered).toMatchObject({
      phase: buildPhaseStep(3, phase),
      timer: { status: "running", durationMs },
    });
    if (
      reentered.type === "snapshot" &&
      reentered.timer.status === "running" &&
      snapshot.type === "snapshot" &&
      snapshot.timer.status === "running"
    ) {
      expect(reentered.timer.endsAt).toBeGreaterThan(snapshot.timer.endsAt);
    }
    reconnected.close();
  });
});
