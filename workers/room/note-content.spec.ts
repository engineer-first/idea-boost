import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import {
  initializeTestRoom,
  runInRoomDO,
  startTimerForTest,
} from "../test-helpers";
import { HOST_ID_HEADER, USER_ID_HEADER } from "./room-do";
import { saveTimerState } from "./timer";

const hostId = "11111111-1111-4111-8111-111111111111";
const noteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function connect(roomName: string): Promise<WebSocket> {
  const response = await env.ROOM_DO.get(
    env.ROOM_DO.idFromName(roomName),
  ).fetch("https://do/ws", {
    headers: {
      Upgrade: "websocket",
      "X-Idea-Boost-Session-Expires-At": String(
        Math.floor(Date.now() / 1000) + 600,
      ),
      [USER_ID_HEADER]: hostId,
      [HOST_ID_HEADER]: hostId,
    },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("socket missing");
  socket.accept();
  await new Promise<void>((resolve) =>
    socket.addEventListener("message", () => resolve(), { once: true }),
  );
  return socket;
}

describe("本文の確定", () => {
  it.each([
    "paused",
    "ended",
    "expired",
  ] as const)("本文digestの待機中にタイマーが%sになったら保存を拒否する", async (status) => {
    const roomName = `note-content-timer-${status}`;
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomName));
    await initializeTestRoom(stub, hostId, "Host");
    await stub.setPhase(buildPhaseStep(1), hostId);
    await startTimerForTest(roomName);
    const socket = await connect(roomName);
    await runInRoomDO(roomName, async (room, state) => {
      const sql = state.storage.sql;
      const now = new Date().toISOString();
      sql.exec(
        "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, '最初', 'private', 'yellow', 0, 0, 1, ?3, ?3)",
        noteId,
        hostId,
        now,
      );
      const revision = Number(
        sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
          .phase_revision,
      );
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      const delayed = vi
        .spyOn(crypto.subtle, "digest")
        .mockImplementation(async (...args) => {
          const result = await digest(...args);
          saveTimerState(
            sql,
            status === "paused"
              ? { status: "paused", remainingMs: 30_000, durationMs: 60_000 }
              : status === "ended"
                ? { status: "ended", durationMs: 60_000 }
                : {
                    status: "running",
                    endsAt: Date.now() - 1,
                    durationMs: 60_000,
                  },
          );
          return result;
        });
      const replies: unknown[] = [];
      const serverSocket = state.getWebSockets()[0];
      const send = vi.spyOn(serverSocket, "send").mockImplementation((data) => {
        replies.push(JSON.parse(String(data)));
      });
      try {
        await room.webSocketMessage(
          serverSocket,
          JSON.stringify({
            type: "note:update-content",
            noteId,
            content: "停止後の本文",
            operationId: crypto.randomUUID(),
            expectedContentRevision: 0,
            expectedPhaseRevision: revision,
          }),
        );
        expect(delayed).toHaveBeenCalledOnce();
        expect(
          sql.exec("SELECT content FROM notes WHERE id=?1", noteId).one()
            .content,
        ).toBe("最初");
        expect(
          sql.exec("SELECT * FROM note_content_receipts").toArray(),
        ).toEqual([]);
        expect(replies).toContainEqual(
          expect.objectContaining({ type: "error", code: "forbidden" }),
        );
        expect(
          replies.some(
            (reply) =>
              (reply as { type: string }).type === "note:content-saved",
          ),
        ).toBe(false);
      } finally {
        delayed.mockRestore();
        send.mockRestore();
      }
    });
    socket.close();
  });

  it("保存確認用の記録に過去の付箋本文を残さない", async () => {
    const roomName = "note-content-receipt-privacy";
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomName));
    await initializeTestRoom(stub, hostId, "Host");
    await stub.setPhase(buildPhaseStep(1), hostId);
    await startTimerForTest(roomName);
    await runInRoomDO(roomName, (_room, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, '最初', 'private', 'yellow', 0, 0, 1, ?3, ?3)",
        noteId,
        hostId,
        now,
      );
    });
    const socket = await connect(roomName);
    const secret = "削除後に保存記録へ残してはいけない文章";
    socket.send(
      JSON.stringify({
        type: "note:update-content",
        noteId,
        content: secret,
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03",
        expectedContentRevision: 0,
        expectedPhaseRevision: 2,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await runInRoomDO(roomName, (_room, state) =>
      state.storage.sql.exec("SELECT * FROM note_content_receipts").toArray(),
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(secret);
    const duplicateReply = new Promise<unknown>((resolve) =>
      socket.addEventListener(
        "message",
        (event) => resolve(JSON.parse(String(event.data))),
        { once: true },
      ),
    );
    socket.send(
      JSON.stringify({
        type: "note:update-content",
        noteId,
        content: secret,
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03",
        expectedContentRevision: 0,
        expectedPhaseRevision: 2,
      }),
    );
    await expect(duplicateReply).resolves.toMatchObject({
      type: "note:content-saved",
      contentRevision: 1,
    });
    socket.close();
  });

  it("同じ本文revisionからの2接続の保存は先着1件だけが確定する", async () => {
    const roomName = "note-content-cas-two-sockets";
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomName));
    await initializeTestRoom(stub, hostId, "Host");
    await stub.setPhase(buildPhaseStep(1), hostId);
    await startTimerForTest(roomName);
    await runInRoomDO(roomName, (_room, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, '最初', 'private', 'yellow', 0, 0, 1, ?3, ?3)",
        noteId,
        hostId,
        now,
      );
    });
    const first = await connect(roomName);
    const second = await connect(roomName);
    first.send(
      JSON.stringify({
        type: "note:update-content",
        noteId,
        content: "先着",
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
        expectedContentRevision: 0,
        expectedPhaseRevision: 2,
      }),
    );
    second.send(
      JSON.stringify({
        type: "note:update-content",
        noteId,
        content: "後着",
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
        expectedContentRevision: 0,
        expectedPhaseRevision: 2,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const result = await runInRoomDO(
      roomName,
      (_room, state) =>
        state.storage.sql
          .exec("SELECT content FROM notes WHERE id = ?1", noteId)
          .one().content,
    );
    expect(result).toBe("先着");
    first.close();
    second.close();
  });
});
