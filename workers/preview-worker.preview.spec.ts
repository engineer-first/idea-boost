import { env, runInDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";
import {
  parseServerMessage,
  type ServerMessage,
} from "../contracts/room-protocol";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { VERIFICATION_CHECKPOINTS } from "../contracts/verification";
import { signToken } from "../lib/session/token";
import previewWorker from "./preview-worker";
import { getDecision } from "./room/decisions";
import { listNotes } from "./room/notes";
import { getPhase } from "./room/phase";
import { sessionCookieFor } from "./test-helpers";
import { visibleTo } from "./visibility";

const owner = {
  sub: "a1000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
  name: "本人",
};
const member = {
  sub: "a1000000-0000-4000-8000-000000000002",
  email: "member@example.test",
  name: "参加者",
};
const config = () => ({
  ...env,
  PREVIEW_ENABLED: "true",
  PREVIEW_ALLOWED_EMAILS: `${owner.email},${member.email}`,
});
const request = (body: unknown, cookie?: string) =>
  new Request("https://preview.test/api/preview/rooms", {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body: JSON.stringify(body),
  });

it("設定なし・未認証・許可外・偽造セッションを拒否する", async () => {
  const cookie = await sessionCookieFor(owner);
  expect(
    (
      await previewWorker.fetch(request({ checkpoint: "1-1" }, cookie), {
        ...config(),
        PREVIEW_ENABLED: undefined,
      })
    ).status,
  ).toBe(503);
  expect(
    (await previewWorker.fetch(request({ checkpoint: "1-1" }), config()))
      .status,
  ).toBe(401);
  expect(
    (
      await previewWorker.fetch(request({ checkpoint: "1-1" }, cookie), {
        ...config(),
        PREVIEW_ALLOWED_EMAILS: member.email,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await previewWorker.fetch(
        request({ checkpoint: "1-1" }, "idea_boost_session=forged"),
        config(),
      )
    ).status,
  ).toBe(401);
});

it("開発用の本人主張はPreviewで受理しない", async () => {
  const assertion = await signToken(
    { kind: "dev", userId: owner.sub, email: owner.email },
    {
      secret: env.SESSION_SECRET,
      audience: TOKEN_AUDIENCE.loginAssertion,
      expiresInSeconds: 60,
    },
  );
  const res = await previewWorker.fetch(
    new Request("https://preview.test/api/auth/sync", {
      method: "POST",
      body: JSON.stringify({ assertion }),
    }),
    config(),
  );
  expect(res.status).toBe(403);
});

it.each(
  VERIFICATION_CHECKPOINTS.filter((c) => c.id !== "lobby"),
)("$id の新規ルームで本人だけに未共有付箋を用意する", async ({ id, phase }) => {
  const cookie = await sessionCookieFor(owner);
  const res = await previewWorker.fetch(
    request({ checkpoint: id }, cookie),
    config(),
  );
  expect(res.status).toBe(201);
  const room = (await res.json()) as { roomId: string; inviteCode: string };
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.roomId));
  await runInDurableObject(stub, async (instance, state) => {
    expect(getPhase(state.storage.sql)).toEqual(phase);
    expect(instance.listMembers().map((m) => m.userId)).toEqual([owner.sub]);
    const notes = listNotes(state.storage.sql, owner.sub);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => n.authorId === owner.sub)).toBe(true);
    for (const note of notes.filter((n) => n.visibility === "private")) {
      expect(
        visibleTo(
          { viewerId: owner.sub },
          { authorId: note.authorId, visibility: note.visibility },
        ),
      ).toBe(true);
      expect(
        visibleTo(
          { viewerId: member.sub },
          { authorId: note.authorId, visibility: note.visibility },
        ),
      ).toBe(false);
    }
    if (phase.kind === "step")
      for (let p = 1; p < phase.phase; p++)
        expect(getDecision(state.storage.sql, p)).not.toBeNull();
  });
  const join = () =>
    previewWorker.fetch(
      new Request("https://preview.test/api/rooms/join", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ code: room.inviteCode }),
      }),
      config(),
    );
  expect((await join()).ok).toBe(true);
  expect(
    (
      await previewWorker.fetch(
        request({ checkpoint: id, roomId: room.roomId }, cookie),
        config(),
      )
    ).status,
  ).toBe(400);
  const another = await previewWorker.fetch(
    request({ checkpoint: id }, cookie),
    config(),
  );
  expect(((await another.json()) as { roomId: string }).roomId).not.toBe(
    room.roomId,
  );
});

async function socketFor(user: typeof owner, roomId: string) {
  const res = await previewWorker.fetch(
    new Request(`https://preview.test/api/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket", Cookie: await sessionCookieFor(user) },
    }),
    config(),
  );
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (!ws) throw new Error("WebSocketが必要です");
  ws.accept();
  const queue: ServerMessage[] = [];
  const waiters: Array<(message: ServerMessage) => void> = [];
  ws.addEventListener("message", (event) => {
    const message = parseServerMessage(event.data);
    if (!message) throw new Error("WS形式が不正です");
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  return {
    ws,
    next: async (): Promise<ServerMessage> =>
      queue.shift() ?? new Promise((resolve) => waiters.push(resolve)),
  };
}
it("別人のWSへ未共有サンプルを送らず、参加者の新規付箋を再入室で保持する", async () => {
  const created = await previewWorker.fetch(
    request({ checkpoint: "1-1" }, await sessionCookieFor(owner)),
    config(),
  );
  const room = (await created.json()) as { roomId: string; inviteCode: string };
  const a = await socketFor(owner, room.roomId);
  const first = await a.next();
  expect(first.type).toBe("snapshot");
  if (first.type === "snapshot") expect(first.notes).toHaveLength(12);
  const cookie = await sessionCookieFor(member);
  const join = () =>
    previewWorker.fetch(
      new Request("https://preview.test/api/rooms/join", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ code: room.inviteCode }),
      }),
      config(),
    );
  expect((await join()).ok).toBe(true);
  const b = await socketFor(member, room.roomId);
  const empty = await b.next();
  expect(empty).toMatchObject({ type: "snapshot", notes: [] });
  b.ws.send(
    JSON.stringify({ type: "note:create", content: "参加者本人の下書き" }),
  );
  let inserted = await b.next();
  while (inserted.type !== "note:inserted") inserted = await b.next();
  expect(inserted.note.authorId).toBe(member.sub);
  b.ws.close();
  expect((await join()).ok).toBe(true);
  const rejoined = await socketFor(member, room.roomId);
  const retained = await rejoined.next();
  expect(retained.type).toBe("snapshot");
  if (retained.type === "snapshot")
    expect(retained.notes.map((n) => n.content)).toEqual([
      "参加者本人の下書き",
    ]);
  a.ws.close();
  rejoined.ws.close();
});
