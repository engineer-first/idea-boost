import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
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
import { getIdeaMapSizeState } from "./room/idea-map";
import { listNotes } from "./room/notes";
import { getPhase } from "./room/phase";
import { sessionCookieFor, startTimerForTest } from "./test-helpers";
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

it.each(VERIFICATION_CHECKPOINTS.filter((c) => c.id !== "lobby"))(
  "$id の新規ルームで本人だけに未共有付箋を用意する",
  async ({ id, phase }) => {
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
      if (phase.kind === "step" && phase.phase === 3 && phase.step >= 2)
        expect(getIdeaMapSizeState(state.storage.sql)).toEqual({
          sizeLevel: 4,
          initialized: true,
        });
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
    expect(((await another.json()) as { roomId: string }).roomId).toBe(
      room.roomId,
    );
  },
);

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
  await startTimerForTest(room.roomId);
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
async function joinRoom(user: typeof owner, code: string) {
  const res = await previewWorker.fetch(
    new Request("https://preview.test/api/rooms/join", {
      method: "POST",
      headers: { Cookie: await sessionCookieFor(user) },
      body: JSON.stringify({ code }),
    }),
    config(),
  );
  expect(res.ok).toBe(true);
}
async function choose(user: typeof owner, checkpoint: string) {
  const res = await previewWorker.fetch(
    request({ checkpoint }, await sessionCookieFor(user)),
    config(),
  );
  expect(res.status).toBe(201);
  return res.json<{ roomId: string; inviteCode: string }>();
}
async function roomState(roomId: string) {
  return runInDurableObject(
    env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)),
    async (instance, state) => ({
      phase: getPhase(state.storage.sql),
      members: instance.listMembers().map((m) => m.userId),
      authors: [
        ...new Set(
          [owner.sub, member.sub].flatMap((viewer) =>
            listNotes(state.storage.sql, viewer)
              .filter((n) => n.authorId === viewer)
              .map((n) => n.authorId),
          ),
        ),
      ],
      contents: listNotes(state.storage.sql, owner.sub).map((n) => n.content),
    }),
  );
}
it("参加中のルームでステップを選ぶと、同じルームを選んだステップに作り直し、全員にサンプルを配る", async () => {
  const first = await choose(owner, "2-1");
  await joinRoom(member, first.inviteCode);
  await startTimerForTest(first.roomId);
  const writer = await socketFor(owner, first.roomId);
  await writer.next();
  writer.ws.send(
    JSON.stringify({ type: "note:create", content: "自分で書いた2-1の付箋" }),
  );
  let inserted = await writer.next();
  while (inserted.type !== "note:inserted") inserted = await writer.next();
  writer.ws.close();
  expect((await roomState(first.roomId)).contents).toContain(
    "自分で書いた2-1の付箋",
  );
  const next = await choose(owner, "3-1");
  expect(next.roomId).toBe(first.roomId);
  const state = await roomState(first.roomId);
  expect(state.phase).toEqual({ kind: "step", phase: 3, step: 1 });
  expect(state.members.sort()).toEqual([owner.sub, member.sub].sort());
  expect(state.authors.sort()).toEqual([owner.sub, member.sub].sort());
  expect(state.contents).not.toContain("自分で書いた2-1の付箋");
});
it("切り替えると参加中の接続を再接続できる形で閉じ、再接続すると新しいステップを受け取る", async () => {
  const first = await choose(owner, "2-1");
  await joinRoom(member, first.inviteCode);
  await startTimerForTest(first.roomId);
  const watcher = await socketFor(member, first.roomId);
  await watcher.next();
  const closed = new Promise<number>((resolve) =>
    watcher.ws.addEventListener("close", (event) => resolve(event.code)),
  );
  await choose(owner, "3-1");
  const { WS_CLOSE_PREVIEW_RESET } = await import("../contracts/preview");
  expect(await closed).toBe(WS_CLOSE_PREVIEW_RESET);
  const again = await socketFor(member, first.roomId);
  const snapshot = await again.next();
  expect(snapshot.type).toBe("snapshot");
  if (snapshot.type === "snapshot") {
    expect(snapshot.phase).toEqual({ kind: "step", phase: 3, step: 1 });
    expect(snapshot.notes.some((n) => n.authorId === member.sub)).toBe(true);
  }
  again.ws.close();
});
it("参加者なら作った人でなくても、ルームのステップを切り替えられる", async () => {
  const first = await choose(owner, "1-1");
  await joinRoom(member, first.inviteCode);
  const next = await choose(member, "2-1");
  expect(next.roomId).toBe(first.roomId);
  expect((await roomState(first.roomId)).phase).toEqual({
    kind: "step",
    phase: 2,
    step: 1,
  });
});
it("ホームからゼロで作ったルームも、途中のステップへ飛べる", async () => {
  const { issueCreationId } = await import("../contracts/room-creation");
  const response = await previewWorker.fetch(
    new Request("https://preview.test/api/rooms", {
      method: "POST",
      headers: {
        Cookie: await sessionCookieFor(owner),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedPrincipal: owner.sub,
        requestId: issueCreationId().requestId,
      }),
    }),
    config(),
  );
  const created = await response.json<{ roomId: string; inviteCode: string }>();
  await joinRoom(member, created.inviteCode);
  const next = await choose(owner, "2-1");
  expect(next.roomId).toBe(created.roomId);
  const state = await roomState(created.roomId);
  expect(state.phase).toEqual({ kind: "step", phase: 2, step: 1 });
  expect(state.members.sort()).toEqual([owner.sub, member.sub].sort());
});
async function leaveStuckSample(roomId: string, checkpoint = "1-1") {
  const { reserveRoomCreation } = await import("./lib/room-creation");
  const { ensureUser } = await import("./lib/db");
  const { issueCreationId } = await import("../contracts/room-creation");
  await ensureUser(env.DB, { id: owner.sub, email: owner.email });
  const creation =
    roomId === "reserve"
      ? await reserveRoomCreation(
          env.DB,
          owner.sub,
          issueCreationId().requestId,
        )
      : { room_id: roomId };
  const stuck = crypto.randomUUID();
  await runInDurableObject(
    env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(owner.sub)),
    async (_instance, state) => {
      await state.storage.put({
        "preview-sample-pending": { id: stuck, checkpoint, creation },
        active: stuck,
      });
    },
  );
  return creation.room_id;
}
const roomRow = (roomId: string) =>
  env.DB.prepare("SELECT id FROM rooms WHERE id=?").bind(roomId).first();
it("途中で止まった準備が残っていても、予約を片付けて別のステップとホームからの作成を続けられる", async () => {
  const { issueCreationId } = await import("../contracts/room-creation");
  const cookie = await sessionCookieFor(owner);
  // 以前の準備がサンプル初期化の前に止まった状態（DOの再起動・公開の切替など）。
  const reserved = await leaveStuckSample("reserve");
  expect(await roomRow(reserved)).not.toBeNull();
  const sample = await previewWorker.fetch(
    request({ checkpoint: "2-1" }, cookie),
    config(),
  );
  expect(sample.status).toBe(201);
  expect(await roomRow(reserved)).toBeNull();
  const home = await previewWorker.fetch(
    new Request("https://preview.test/api/rooms", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedPrincipal: owner.sub,
        requestId: issueCreationId().requestId,
      }),
    }),
    config(),
  );
  expect(home.status).toBe(200);
});
it("公開まで終わった準備の印が残っていても、そのルームは削除しない", async () => {
  const cookie = await sessionCookieFor(owner);
  const published = await (
    await previewWorker.fetch(request({ checkpoint: "1-1" }, cookie), config())
  ).json<{ roomId: string }>();
  await leaveStuckSample(published.roomId);
  expect(
    (
      await previewWorker.fetch(
        request({ checkpoint: "2-1" }, cookie),
        config(),
      )
    ).status,
  ).toBe(201);
  expect(await roomRow(published.roomId)).not.toBeNull();
});
it.each(["セッション", "ログイン主張"])(
  "署名済みゲストの%sは403で拒否しユーザーを作らない",
  async (kind) => {
    const id = crypto.randomUUID();
    const token = await signToken(
      kind === "セッション"
        ? { kind: "guest", sub: id, email: null }
        : { kind: "guest", userId: id, displayName: "はな" },
      {
        secret: env.SESSION_SECRET,
        audience:
          kind === "セッション"
            ? TOKEN_AUDIENCE.session
            : TOKEN_AUDIENCE.loginAssertion,
        expiresInSeconds: 60,
      },
    );
    const req =
      kind === "セッション"
        ? request({ checkpoint: "1-1" }, `idea_boost_session=${token}`)
        : new Request("https://preview.test/api/auth/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assertion: token }),
          });
    expect((await previewWorker.fetch(req, config())).status).toBe(403);
    expect(
      await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(id).first(),
    ).toBeNull();
  },
);
