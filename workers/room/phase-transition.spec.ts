import { env, runDurableObjectAlarm } from "cloudflare:test";
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

describe("本文保存を待つ進行", () => {
  it("編集可能ステップからは最大2秒の猶予を永続化し、期限までphaseを変えない", async () => {
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
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      // 送信前のRPCやWSの配送時間を猶予へ加算しない。
      // 猶予の永続化後に届く保存要求の通知を待つ。
      const requested = new Promise<ServerMessage | null>((resolve) =>
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
      const message = await requested;
      expect(message).toMatchObject({
        type: "phase:save-requested",
        deadlineAt: start + 2000,
      });
      expect(await stub.getPhase()).toEqual(buildPhaseStep(1));
      const deadline = await runInRoomDO(
        name,
        (_room, state) =>
          state.storage.sql
            .exec(
              "SELECT deadline_at FROM pending_phase_transition WHERE id = 1",
            )
            .one().deadline_at as number,
      );
      expect(deadline - start).toBe(2000);
      clock.mockReturnValue(deadline - 1);
      await runDurableObjectAlarm(stub);
      expect(await stub.getPhase()).toEqual(buildPhaseStep(1));
      clock.mockReturnValue(deadline);
      await runDurableObjectAlarm(stub);
      expect(await stub.getPhase()).toEqual(buildPhaseStep(2));
    } finally {
      clock.mockRestore();
      socket.close();
    }
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
    ownerSocket.ws.send(JSON.stringify({ type: "phase:next", ...expectation }));
    await Promise.all([
      untilType(ownerSocket, "phase:save-requested"),
      untilType(memberSocket, "phase:save-requested"),
    ]);

    memberSocket.ws.send(
      JSON.stringify({
        type: "note:update-content",
        operationId: crypto.randomUUID(),
        noteId: noteIds.savedDuringWait,
        content: "  保存待ち中に確定した本文 \n",
        expectedContentRevision: 0,
        expectedPhaseRevision: expectation.expectedRevision,
      }),
    );
    await untilType(memberSocket, "note:content-saved");
    await untilType(ownerSocket, "note:updated");

    await runInRoomDO(roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE pending_phase_transition SET deadline_at = ?1 WHERE id = 1",
        Date.now() - 1,
      );
      await instance.alarm();
    });
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
        content: "  保存待ち中に確定した本文 \n",
      }),
    );
    expect(memberSnapshot.notes).toContainEqual(
      expect.objectContaining({
        id: noteIds.savedDuringWait,
        content: "  保存待ち中に確定した本文 \n",
      }),
    );
    expect(ownerSnapshot.notes).toContainEqual(
      expect.objectContaining({
        id: noteIds.nonEmpty,
        content: "  前後の空白は保持する \n",
      }),
    );
    expect(ownerSnapshot.notes).toContainEqual(
      expect.objectContaining({ id: noteIds.private, visibility: "private" }),
    );
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
  ] as const)("$nameの個人作業から共有へ進むとき空白のマイ付箋だけを削除する", async ({
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
      ownerContent: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
      memberEmpty: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
      memberContent: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
    };
    await runInRoomDO(roomId, (_room, state) => {
      for (const [id, authorId, content] of [
        [noteIds.ownerEmpty, hostId, " \t\u3000\n "],
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
    ownerSocket.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    await Promise.all([
      untilType(ownerSocket, "phase:save-requested"),
      untilType(memberSocket, "phase:save-requested"),
    ]);

    await runInRoomDO(roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE pending_phase_transition SET deadline_at = ?1 WHERE id = 1",
        Date.now() - 1,
      );
      await instance.alarm();
    });
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
    await untilType(ownerSocket, "phase:save-requested");
    await runInRoomDO(roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE pending_phase_transition SET deadline_at = ?1 WHERE id = 1",
        Date.now() - 1,
      );
      await instance.alarm();
    });
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
    await untilType(socket, "phase:save-requested");
    await runInRoomDO(roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE pending_phase_transition SET deadline_at = ?1 WHERE id = 1",
        Date.now() - 1,
      );
      await instance.alarm();
    });
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
    await untilType(reconnected, "phase:save-requested");
    await runInRoomDO(roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE pending_phase_transition SET deadline_at = ?1 WHERE id = 1",
        Date.now() - 1,
      );
      await instance.alarm();
    });
    await untilType(reconnected, "phase:updated");
    reconnected.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    await untilType(reconnected, "phase:save-requested");
    await runInRoomDO(roomId, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE pending_phase_transition SET deadline_at = ?1 WHERE id = 1",
        Date.now() - 1,
      );
      await instance.alarm();
    });
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
