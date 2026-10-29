import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerMessage } from "../contracts/room-protocol";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { signToken } from "../lib/session/token";
import { upsertUserFromAssertion } from "./lib/db";
import {
  arrangeSharingPresenter,
  connectRoomAs,
  createRoomAs,
  endTimerForTest,
  listMemberIds,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
  startTimerForTest,
  type TestUser,
} from "./test-helpers";

const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

async function guest() {
  const user = {
    kind: "guest" as const,
    sub: crypto.randomUUID(),
    email: null,
    name: "選んだ表示名",
  };
  await upsertUserFromAssertion(env.DB, {
    kind: "guest",
    userId: user.sub,
    displayName: user.name,
  });
  return user;
}
function google() {
  const id = crypto.randomUUID();
  return { googleSub: `google-${id}`, email: `${id}@example.test` };
}
async function row(id: string) {
  return env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
}
async function link(
  user: TestUser | null,
  identity = google(),
  principal = user?.sub ?? crypto.randomUUID(),
  audience: string = "idea-boost:account-link-assertion",
) {
  const assertion = await signToken(
    { principal, ...identity, name: "Googleの名前" },
    {
      secret: env.SESSION_SECRET,
      audience,
      expiresInSeconds: 60,
    },
  );
  return exports.default.fetch("https://api.test/api/auth/link-google", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(user ? { Cookie: await sessionCookieFor(user) } : {}),
    },
    body: JSON.stringify({ assertion }),
  });
}
async function conflict(response: Response, reason: string) {
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ ok: false, reason });
}
async function receive<T extends ServerMessage["type"]>(
  socket: RoomSocket,
  type: T,
): Promise<Extract<ServerMessage, { type: T }>> {
  for (;;) {
    const message = await socket.next();
    if (message.type === "error") throw new Error(JSON.stringify(message));
    if (message.type === type)
      return message as Extract<ServerMessage, { type: T }>;
  }
}

describe("ゲスト本人へのGoogle連携", () => {
  it("連携後に同じGoogleで通常同期すると同じusers.idへ戻り、表示名とrevisionとnameを維持する", async () => {
    const user = await guest();
    const identity = google();
    const before = await row(user.sub);
    const response = await link(user, identity);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, userId: user.sub });
    expect(await row(user.sub)).toEqual({
      ...before,
      google_sub: identity.googleSub,
      email: identity.email,
    });
    const assertion = await signToken(
      { kind: "google", ...identity, name: "Googleの名前" },
      {
        secret: env.SESSION_SECRET,
        audience: TOKEN_AUDIENCE.loginAssertion,
        expiresInSeconds: 60,
      },
    );
    const synced = await exports.default.fetch(
      "https://api.test/api/auth/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assertion }),
      },
    );
    expect(synced.status).toBe(200);
    expect(await synced.json()).toEqual({ userId: user.sub });
    expect(await row(user.sub)).toMatchObject({
      display_name: user.name,
      display_name_revision: 1,
    });
  });

  it.each(["google_sub", "email"] as const)(
    "別IDが持つ%sへは連携できず双方の行を変えない",
    async (field) => {
      const user = await guest();
      const occupied = google();
      const other = await upsertUserFromAssertion(env.DB, {
        kind: "google",
        ...occupied,
      });
      if (typeof other !== "string")
        throw new Error("比較対象のGoogle本人を作成できません。");
      const before = [await row(user.sub), await row(other)];
      await conflict(
        await link(user, {
          ...google(),
          ...(field === "google_sub"
            ? { googleSub: occupied.googleSub }
            : { email: occupied.email }),
        }),
        "google_account_in_use",
      );
      expect([await row(user.sub), await row(other)]).toEqual(before);
    },
  );

  it("別Googleに連携済みならalready_linkedで行を変えない", async () => {
    const user = await guest();
    const identity = google();
    await env.DB.prepare("UPDATE users SET google_sub=?,email=? WHERE id=?")
      .bind(identity.googleSub, identity.email, user.sub)
      .run();
    const before = await row(user.sub);
    await conflict(await link(user), "already_linked");
    expect(await row(user.sub)).toEqual(before);
  });
  it("users行のない本人はalready_linkedを返し行を作らない", async () => {
    const user = {
      kind: "guest" as const,
      sub: crypto.randomUUID(),
      email: null,
      name: "未登録",
    };
    await conflict(await link(user), "already_linked");
    expect(await row(user.sub)).toBeNull();
  });
  it("同じIDと同じGoogleの再送は200で冪等になる", async () => {
    const user = await guest();
    const identity = google();
    for (let i = 0; i < 2; i++) {
      const response = await link(user, identity);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, userId: user.sub });
    }
  });
  it("同じゲストへの異なるGoogleの並行連携は片方だけ成功する", async () => {
    const user = await guest();
    const identities = [google(), google()];
    const responses = await Promise.all(
      identities.map((identity) => link(user, identity)),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((r) => r.status === 200);
    expect(await row(user.sub)).toMatchObject({
      google_sub: identities[winner].googleSub,
      email: identities[winner].email,
    });
    await conflict(responses[1 - winner], "already_linked");
  });
  it("同じGoogleへの二つのゲストの並行連携は片方だけ成功し敗者の行を変えない", async () => {
    const users = await Promise.all([guest(), guest()]);
    const before = await Promise.all(users.map((u) => row(u.sub)));
    const identity = google();
    const responses = await Promise.all(users.map((u) => link(u, identity)));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex((r) => r.status === 200);
    expect(await row(users[winner].sub)).toMatchObject({
      google_sub: identity.googleSub,
      email: identity.email,
    });
    expect(await row(users[1 - winner].sub)).toEqual(before[1 - winner]);
    await conflict(responses[1 - winner], "google_account_in_use");
  });
  it("accountセッションはnot_guestを返す", async () => {
    const user = await guest();
    await conflict(
      await link({ ...user, kind: "account", email: "account@example.test" }),
      "not_guest",
    );
  });
  it("主張のprincipalとCookieの本人が違えば403で行を変えない", async () => {
    const user = await guest();
    const before = await row(user.sub);
    expect((await link(user, google(), crypto.randomUUID())).status).toBe(403);
    expect(await row(user.sub)).toEqual(before);
  });
  it.each([TOKEN_AUDIENCE.loginAssertion, TOKEN_AUDIENCE.session])(
    "%sのトークンは連携主張に流用できない",
    async (audience) => {
      const user = await guest();
      expect((await link(user, google(), user.sub, audience)).status).toBe(401);
    },
  );
  it("セッションがなければ401を返す", async () => {
    expect((await link(null)).status).toBe(401);
  });
  it.each([
    {},
    { assertion: "" },
    { assertion: "x", principal: "指定禁止" },
    { assertion: "x".repeat(8193) },
  ])("不正な要求%jは400を返す", async (body) => {
    const user = await guest();
    const response = await exports.default.fetch(
      "https://api.test/api/auth/link-google",
      {
        method: "POST",
        headers: {
          Cookie: await sessionCookieFor(user),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    expect(response.status).toBe(400);
  });

  it("ゲストのホスト権限・在籍・付箋・投票・完了成果閲覧を同じsubのaccountへ引き継ぐ", async () => {
    const user = await guest();
    const { roomId } = await createRoomAs(user);
    const socket = await connectRoomAs(user, roomId);
    sockets.push(socket);
    await receive(socket, "snapshot");
    socket.ws.send(JSON.stringify({ type: "start_phase" }));
    await receive(socket, "phase:updated");
    await startTimerForTest(roomId);
    socket.ws.send(
      JSON.stringify({ type: "note:create", content: "引き継ぐ成果" }),
    );
    const { note } = await receive(socket, "note:inserted");
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    await stub.setPhase({ kind: "step", phase: 1, step: 2 }, user.sub);
    await arrangeSharingPresenter(roomId, user.sub);
    await startTimerForTest(roomId);
    socket.ws.send(
      JSON.stringify({ type: "note:publish", noteId: note.id, x: 30, y: 40 }),
    );
    await receive(socket, "note:inserted");
    await stub.setPhase({ kind: "step", phase: 1, step: 4 }, user.sub);
    await startTimerForTest(roomId);
    socket.ws.send(
      JSON.stringify({
        type: "note:vote",
        noteId: note.id,
        kind: "subjective",
      }),
    );
    await receive(socket, "note:updated");
    const readWork = () =>
      runInRoomDO(roomId, (_room, state) => ({
        notes: state.storage.sql.exec("SELECT * FROM notes").toArray(),
        votes: state.storage.sql
          .exec("SELECT * FROM note_vote_stickers")
          .toArray(),
      }));
    const before = await readWork();
    expect(before.notes).toHaveLength(1);
    expect(before.votes).toHaveLength(1);
    const identity = google();
    expect((await link(user, identity)).status).toBe(200);
    const account = {
      ...user,
      kind: "account" as const,
      email: identity.email,
    };
    const headers = { Cookie: await sessionCookieFor(account) };
    const info = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}`,
      { headers },
    );
    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({
      isHost: true,
      hostUserId: user.sub,
    });
    expect(await listMemberIds(roomId)).toEqual([user.sub]);
    const reconnected = await connectRoomAs(account, roomId);
    sockets.push(reconnected);
    expect(await receive(reconnected, "snapshot")).toMatchObject({
      isHost: true,
    });
    expect(await readWork()).toEqual(before);
    await endTimerForTest(roomId);
    reconnected.ws.send(JSON.stringify({ type: "timer:extend" }));
    expect(await receive(reconnected, "timer:updated")).toMatchObject({
      timer: { status: "running", durationMs: 60_000, extensionUsed: true },
    });
    await runInRoomDO(roomId, async (room, state) => {
      await room.setPhase({ kind: "step", phase: 3, step: 5 }, user.sub);
      for (const phase of [1, 2, 3])
        state.storage.sql.exec(
          "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
          phase,
          crypto.randomUUID(),
          "引き継ぐ決定",
          user.sub,
          new Date().toISOString(),
        );
      await (
        room as unknown as {
          preserveSharedOutcome(
            confirmed: boolean,
            now: number,
            participant: boolean,
          ): Promise<void>;
        }
      ).preserveSharedOutcome(true, Date.now(), true);
      await room.alarm();
    });
    expect(
      (
        await exports.default.fetch(
          `https://api.test/api/completed-rooms/${roomId}`,
          { headers },
        )
      ).status,
    ).toBe(200);
    const completed = await exports.default.fetch(
      "https://api.test/api/completed-rooms",
      { headers },
    );
    expect(completed.status).toBe(200);
    expect(await completed.json()).toMatchObject({
      rooms: expect.arrayContaining([expect.objectContaining({ roomId })]),
    });
  });
});
