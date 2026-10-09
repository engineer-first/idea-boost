import { env, evictDurableObject, SELF } from "cloudflare:test";
import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import { TOKEN_AUDIENCE } from "../../contracts/session";
import { getSessionFromRequest } from "../lib/session";
import {
  connectRoomAs,
  createRoomAs,
  listMemberIds,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";
import { RoomBroadcaster } from "./broadcast";
import type { HandlerCtx } from "./handler-context";
import { noteHandlers } from "./note-handlers";

const USER = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  name: "Owner",
};

describe("認証期限のfail-closed", () => {
  it("署名が有効でも期限のないセッションをHTTPで拒否する", async () => {
    const token = await new SignJWT(USER)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("idea-boost")
      .setAudience(TOKEN_AUDIENCE.session)
      .sign(new TextEncoder().encode(env.SESSION_SECRET));
    const response = await SELF.fetch("https://api.test/api/rooms", {
      headers: { Cookie: `idea_boost_session=${token}` },
    });
    expect(response.status).toBe(401);
  });

  it.each([
    undefined,
    0,
    "invalid",
    Math.floor(Date.now() / 1000),
  ])("旧・不正・期限到達attachment (%s)は個別返信も操作も拒否する", async (exp) => {
    const { roomId } = await createRoomAs(USER);
    const connection = await connectRoomAs(USER, roomId);
    await connection.next();
    await runInRoomDO(roomId, async (instance, state) => {
      const socket = state.getWebSockets()[0];
      socket.serializeAttachment({ userId: USER.sub, sessionExpiresAt: exp });
      await instance.webSocketMessage(
        socket,
        JSON.stringify({ type: "invalid" }),
      );
      expect(socket.readyState).not.toBe(WebSocket.OPEN);
    });
    expect(await listMemberIds(roomId)).toEqual([USER.sub]);
    connection.close();
  });

  it("クライアントの偽装期限を署名済み期限で上書きする", async () => {
    const { roomId } = await createRoomAs(USER);
    const response = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/ws`,
      {
        headers: {
          Upgrade: "websocket",
          Cookie: await sessionCookieFor(USER),
          "X-Idea-Boost-Session-Expires-At": "9999999999",
        },
      },
    );
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    await runInRoomDO(roomId, (_instance, state) => {
      expect(
        state.getWebSockets()[0].deserializeAttachment().sessionExpiresAt,
      ).toBeLessThan(9999999999);
    });
    response.webSocket?.close();
  });
});

it("無操作の旧タブを配信から除外し、有効な新タブと確定本文・在籍を維持する", async () => {
  const { roomId } = await createRoomAs(USER);
  const old = await connectRoomAs(USER, roomId);
  await old.next();
  const fresh = await connectRoomAs(USER, roomId);
  await fresh.next();
  await runInRoomDO(roomId, async (instance, state) => {
    const [expired, valid] = state.getWebSockets();
    const validIdentity = valid.deserializeAttachment();
    const now = new Date().toISOString();
    state.storage.sql.exec(
      "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', ?1, '確定済み本文', 'private', 'yellow', 0, 0, 1, ?2, ?2)",
      USER.sub,
      now,
    );
    state.storage.sql.exec(
      "INSERT INTO note_move_operations(operation_id,user_id,connection_id,request_json,state,lease_until,created_at) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',?1,'old-connection','{}','active',?2,?3)",
      USER.sub,
      Date.now() + 60000,
      Date.now(),
    );
    state.storage.sql.exec(
      "INSERT INTO note_move_locks(note_id,operation_id) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc')",
    );
    state.storage.sql.exec(
      "INSERT INTO legacy_note_drag_leases(user_id,drag_id,lease_until) VALUES (?1,'old-drag',?2),(?1,'new-drag',?2)",
      USER.sub,
      Date.now() + 60000,
    );
    expired.serializeAttachment({
      ...expired.deserializeAttachment(),
      sessionExpiresAt: 1,
      hasCursor: true,
      adoptionFocusNoteId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      moveConnectionId: "old-connection",
      activeMoveOperationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      activeDrag: {
        noteId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        dragId: "old-drag",
        leaseUntil: Date.now() + 60000,
      },
    });
    valid.serializeAttachment({
      ...validIdentity,
      hasCursor: true,
      activeDrag: {
        noteId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        dragId: "new-drag",
        leaseUntil: Date.now() + 60000,
      },
    });
    await instance.upsertMember(
      "22222222-2222-4222-8222-222222222222",
      "Other member",
    );
    expect(expired.readyState).not.toBe(WebSocket.OPEN);
    expect(valid.readyState).toBe(WebSocket.OPEN);
    expect(expired.deserializeAttachment().hasCursor).toBeUndefined();
    expect(expired.deserializeAttachment().adoptionFocusNoteId).toBeUndefined();
    await instance.webSocketClose(
      expired,
      4002,
      "authentication required",
      true,
    );
    expect(valid.deserializeAttachment().hasCursor).toBe(true);
    expect(valid.deserializeAttachment().activeDrag.dragId).toBe("new-drag");
    expect(
      state.storage.sql
        .exec(
          "SELECT state FROM note_move_operations WHERE operation_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'",
        )
        .one().state,
    ).toBe("cancelled");
    expect(
      state.storage.sql.exec("SELECT * FROM note_move_locks").toArray(),
    ).toEqual([]);
    expect(
      state.storage.sql
        .exec("SELECT drag_id FROM legacy_note_drag_leases")
        .toArray(),
    ).toEqual([{ drag_id: "new-drag" }]);
    expect(
      state.storage.sql
        .exec(
          "SELECT content FROM notes WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'",
        )
        .one().content,
    ).toBe("確定済み本文");
    expect(valid.deserializeAttachment().sessionExpiresAt).toBe(
      validIdentity.sessionExpiresAt,
    );
  });
  expect(await listMemberIds(roomId)).toContain(USER.sub);
  old.close();
  fresh.close();
});

it.each([
  undefined,
  "",
  "NaN",
  "Infinity",
  "-1",
  "1",
  "1.5",
])("DOの未検証・不正・期限切れ引継ぎ (%s)を拒否する", async (expiry) => {
  const { roomId } = await createRoomAs(USER);
  const headers = new Headers({
    Upgrade: "websocket",
    "X-Idea-Boost-User-Id": USER.sub,
    "X-Idea-Boost-Host-Id": USER.sub,
  });
  if (expiry !== undefined)
    headers.set("X-Idea-Boost-Session-Expires-At", expiry);
  const response = await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).fetch(
    "https://do/ws",
    { headers },
  );
  expect(response.status).toBe(401);
});

it.each([
  -1, 0, 1,
])("HTTPと既存WSは署名済み期限から%s秒の時点で同じ判定をする", async (offset) => {
  const expiry = Math.floor(Date.now() / 1000) + 60;
  const token = await new SignJWT(USER)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("idea-boost")
    .setAudience(TOKEN_AUDIENCE.session)
    .setExpirationTime(expiry)
    .sign(new TextEncoder().encode(env.SESSION_SECRET));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime((expiry + offset) * 1000);
  const socket = {
    readyState: WebSocket.OPEN,
    deserializeAttachment: () => ({
      userId: USER.sub,
      sessionExpiresAt: expiry,
    }),
    close: vi.fn(),
  } as unknown as WebSocket;
  try {
    const session = await getSessionFromRequest(
      new Request("https://api.test", {
        headers: { Cookie: `idea_boost_session=${token}` },
      }),
      env.SESSION_SECRET,
    );
    expect(session !== null).toBe(offset < 0);
    expect(
      new RoomBroadcaster({ getWebSockets: () => [socket] }).authorize(socket),
    ).toBe(offset < 0);
  } finally {
    vi.useRealTimers();
  }
});

it("ハイバネーションから復帰してもattachmentの期限切れを拒否する", async () => {
  const { roomId } = await createRoomAs(USER);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
    buildPhaseStep(1),
    USER.sub,
  );
  const connection = await connectRoomAs(USER, roomId);
  await connection.next();
  await runInRoomDO(roomId, (_instance, state) => {
    const socket = state.getWebSockets()[0];
    socket.serializeAttachment({
      ...socket.deserializeAttachment(),
      sessionExpiresAt: 1,
    });
  });
  await evictDurableObject(env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)));
  await runInRoomDO(roomId, async (instance, state) => {
    const socket = state.getWebSockets()[0];
    expect(socket.deserializeAttachment().sessionExpiresAt).toBe(1);
    await instance.webSocketMessage(
      socket,
      JSON.stringify({ type: "note:create", content: "拒否する本文" }),
    );
    expect(socket.readyState).not.toBe(WebSocket.OPEN);
    expect(state.storage.sql.exec("SELECT * FROM notes").toArray()).toEqual([]);
  });
  connection.close();
});

it("保存確定後に期限切れで結果不明になっても、新接続の照会・再送で二重反映せず後続編集を保護する", async () => {
  const { roomId } = await createRoomAs(USER);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  await stub.setPhase(buildPhaseStep(1), USER.sub);
  const old = await connectRoomAs(USER, roomId);
  await old.next();
  const noteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
  let phaseRevision = 0;
  await runInRoomDO(roomId, async (_instance, state) => {
    phaseRevision = Number(
      state.storage.sql
        .exec("SELECT phase_revision FROM room_state WHERE id=1")
        .one().phase_revision,
    );
    const now = new Date().toISOString();
    state.storage.sql.exec(
      "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, '最初', 'private', 'yellow', 0, 0, 1, ?3, ?3)",
      noteId,
      USER.sub,
      now,
    );
    const socket = state.getWebSockets()[0];
    const broadcaster = new RoomBroadcaster(state);
    const replies: unknown[] = [];
    const ctx: HandlerCtx = {
      sql: state.storage.sql,
      storage: state.storage,
      userId: USER.sub,
      ws: socket,
      broadcaster,
      refreshSnapshots: () => {},
      reply: (message) => {
        // 確定transaction後・ACK前に期限を横断する。
        socket.serializeAttachment({
          ...socket.deserializeAttachment(),
          sessionExpiresAt: 1,
        });
        broadcaster.sendTo(socket, message);
        if (socket.readyState === WebSocket.OPEN) replies.push(message);
      },
    };
    await noteHandlers["note:update-content"](ctx, {
      type: "note:update-content",
      noteId,
      content: "確定した本文",
      operationId,
      expectedContentRevision: 0,
      expectedPhaseRevision: phaseRevision,
    });
    expect(replies).toEqual([]);
    expect(socket.readyState).not.toBe(WebSocket.OPEN);
    expect(
      state.storage.sql
        .exec("SELECT content FROM notes WHERE id=?1", noteId)
        .one().content,
    ).toBe("確定した本文");
  });
  const fresh = await connectRoomAs(USER, roomId);
  expect((await fresh.next()).type).toBe("snapshot");
  fresh.ws.send(JSON.stringify({ type: "note:content-status", operationId }));
  expect(await fresh.next()).toMatchObject({
    type: "note:content-status-result",
    status: "accepted",
    contentRevision: 1,
  });
  await runInRoomDO(roomId, (_instance, state) => {
    state.storage.sql.exec(
      "UPDATE notes SET content='後続の編集' WHERE id=?1",
      noteId,
    );
    state.storage.sql.exec(
      "UPDATE note_content_versions SET content_revision=2 WHERE note_id=?1",
      noteId,
    );
  });
  fresh.ws.send(
    JSON.stringify({
      type: "note:update-content",
      noteId,
      content: "確定した本文",
      operationId,
      expectedContentRevision: 0,
      expectedPhaseRevision: phaseRevision,
    }),
  );
  expect(await fresh.next()).toMatchObject({
    type: "note:content-saved",
    contentRevision: 1,
  });
  fresh.ws.send(
    JSON.stringify({
      type: "note:update-content",
      noteId,
      content: "古い下書き",
      operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
      expectedContentRevision: 0,
      expectedPhaseRevision: phaseRevision,
    }),
  );
  expect(await fresh.next()).toMatchObject({
    type: "error",
    code: "content-conflict",
  });
  await runInRoomDO(roomId, (_instance, state) => {
    expect(
      state.storage.sql
        .exec("SELECT content FROM notes WHERE id=?1", noteId)
        .one().content,
    ).toBe("後続の編集");
    expect(
      state.storage.sql.exec("SELECT * FROM note_content_receipts").toArray(),
    ).toHaveLength(1);
  });
  old.close();
  fresh.close();
});

it("DOへの引継ぎの非同期待機中に署名済み期限を横断した接続はsnapshot前に拒否する", async () => {
  const { roomId } = await createRoomAs(USER);
  await runInRoomDO(roomId, async (instance, state) => {
    const expiry = Math.floor(Date.now() / 1000) + 60;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((expiry - 1) * 1000);
    const transition = vi
      .spyOn(
        instance as unknown as {
          processExpiredTransition: () => Promise<boolean>;
        },
        "processExpiredTransition",
      )
      .mockImplementation(async () => {
        vi.setSystemTime(expiry * 1000);
        return true;
      });
    try {
      const response = await instance.fetch(
        new Request("https://do/ws", {
          headers: {
            Upgrade: "websocket",
            "X-Idea-Boost-Session-Expires-At": String(expiry),
            "X-Idea-Boost-User-Id": USER.sub,
            "X-Idea-Boost-Host-Id": USER.sub,
          },
        }),
      );
      expect(response.status).toBe(401);
      expect(state.getWebSockets()).toHaveLength(0);
    } finally {
      transition.mockRestore();
      vi.useRealTimers();
    }
  });
});
