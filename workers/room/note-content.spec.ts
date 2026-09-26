import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import { runInRoomDO } from "../test-helpers";
import { HOST_ID_HEADER, USER_ID_HEADER } from "./room-do";

const hostId = "11111111-1111-4111-8111-111111111111";
const noteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function connect(roomName: string): Promise<WebSocket> {
  const response = await env.ROOM_DO.get(
    env.ROOM_DO.idFromName(roomName),
  ).fetch("https://do/ws", {
    headers: {
      Upgrade: "websocket",
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
  it("同じ本文revisionからの2接続の保存は先着1件だけが確定する", async () => {
    const roomName = "note-content-cas-two-sockets";
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomName));
    await stub.initializeNewRoom(hostId, "Host");
    await stub.setPhase(buildPhaseStep(1), hostId);
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
