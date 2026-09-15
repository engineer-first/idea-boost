// api-worker の統合テスト。Supabase 時代の pgTAP テスト（認可の肯定/否定系・
// join の冪等性）をワーカー境界のテストとして移植したもの。
// - anon（セッションなし）は何もできない
// - 非メンバーにはルームの存在自体を見せない (404)
// - join は冪等（複数回呼んでもメンバーは重複しない）
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildLobbyPhase } from "../contracts/phase.fixture";
import { NOTE_COLOR_PALETTE } from "../contracts/room-protocol";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { signToken } from "../lib/session/token";
import { HOST_ID_HEADER } from "./room/room-do";
import { joinRoomAs, listMemberIds, runInRoomDO } from "./test-helpers";

const OWNER = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  name: "Owner",
};
const MEMBER = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "member@example.test",
  name: "Member",
};
const OUTSIDER = {
  sub: "33333333-3333-4333-8333-333333333333",
  email: "viewer@example.test",
  name: "Outsider",
};
const NOTE_COLOR_PATTERN = new RegExp(`^(${NOTE_COLOR_PALETTE.join("|")})$`);
const LOBBY = buildLobbyPhase();

async function sessionCookie(user: typeof OWNER): Promise<string> {
  const token = await signToken(user, {
    secret: env.SESSION_SECRET,
    audience: TOKEN_AUDIENCE.session,
    expiresInSeconds: 600,
  });
  return `idea_boost_session=${token}`;
}

async function createRoomAs(
  user: typeof OWNER,
): Promise<{ roomId: string; inviteCode: string }> {
  const res = await SELF.fetch("https://api.test/api/rooms", {
    method: "POST",
    headers: { Cookie: await sessionCookie(user) },
  });
  expect(res.status).toBe(200);
  return res.json();
}

describe("認証ゲート（pgTAP: anon の視点）", () => {
  it("セッションなしではルームを作成できない", async () => {
    const res = await SELF.fetch("https://api.test/api/rooms", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("セッションなしではルーム参加できない", async () => {
    const res = await SELF.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABC234" }),
    });
    expect(res.status).toBe(401);
  });

  it("セッションなしではルーム情報を取得できない", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/rooms/11111111-1111-4111-8111-111111111111",
    );
    expect(res.status).toBe(401);
  });

  it("改ざんされたセッションは拒否される", async () => {
    const cookie = await sessionCookie(OWNER);
    const res = await SELF.fetch("https://api.test/api/rooms", {
      method: "POST",
      headers: { Cookie: `${cookie.slice(0, -3)}xxx` },
    });
    expect(res.status).toBe(401);
  });
});

describe("ルーム作成", () => {
  it("ルームを作成すると6桁の招待コードが発行され、host がメンバーになる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    expect(roomId).toMatch(/^[0-9a-f-]{36}$/);
    expect(inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    // pgTAP: 「create_room() は host を room_members に1件だけ登録する」
    const memberIds = await listMemberIds(roomId);
    expect(memberIds).toEqual([OWNER.sub]);
  });

  it("作成した host はルーム情報を取得できる（isHost=true, phase=lobby）", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}`, {
      headers: { Cookie: await sessionCookie(OWNER) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      roomId,
      inviteCode,
      isHost: true,
      hostUserId: OWNER.sub,
      phase: LOBBY,
    });
  });
});

describe("ルーム情報（isHost / hostUserId / phase）", () => {
  it("参加者は isHost=false と hostUserId（作成者）を取得できる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}`, {
      headers: { Cookie: await sessionCookie(MEMBER) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      roomId,
      inviteCode,
      isHost: false,
      hostUserId: OWNER.sub,
      phase: LOBBY,
    });
  });
});

describe("メンバー一覧（GET /api/rooms/:id/members）", () => {
  it("メンバーは name 付きの参加者一覧を取得できる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    const res = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/members`,
      { headers: { Cookie: await sessionCookie(OWNER) } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      members: [
        {
          userId: OWNER.sub,
          name: OWNER.name,
          color: expect.stringMatching(NOTE_COLOR_PATTERN),
        },
        {
          userId: MEMBER.sub,
          name: MEMBER.name,
          color: expect.stringMatching(NOTE_COLOR_PATTERN),
        },
      ],
    });
  });

  it("非メンバーは 404（ルームの存在自体を見せない）", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/members`,
      { headers: { Cookie: await sessionCookie(OUTSIDER) } },
    );
    expect(res.status).toBe(404);
  });

  it("セッションなしでは 401", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/members`,
    );
    expect(res.status).toBe(401);
  });
});

describe("可視性（pgTAP: 非メンバーの視点）", () => {
  it("非メンバーにはルームの存在自体を見せない (404)", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}`, {
      headers: { Cookie: await sessionCookie(OUTSIDER) },
    });
    expect(res.status).toBe(404);
  });

  it("存在しないルームも同じ 404 を返す（存在の推測をさせない）", async () => {
    const res = await SELF.fetch(
      "https://api.test/api/rooms/99999999-9999-4999-8999-999999999999",
      { headers: { Cookie: await sessionCookie(OUTSIDER) } },
    );
    expect(res.status).toBe(404);
  });
});

describe("ルーム参加（pgTAP: join_room）", () => {
  it("招待コードで参加すると、ルーム情報を取得できるようになる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);

    const before = await SELF.fetch(`https://api.test/api/rooms/${roomId}`, {
      headers: { Cookie: await sessionCookie(MEMBER) },
    });
    expect(before.status).toBe(404);

    const join = await SELF.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: {
        Cookie: await sessionCookie(MEMBER),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: inviteCode }),
    });
    expect(join.status).toBe(200);
    expect(await join.json()).toEqual({ roomId });

    const after = await SELF.fetch(`https://api.test/api/rooms/${roomId}`, {
      headers: { Cookie: await sessionCookie(MEMBER) },
    });
    expect(after.status).toBe(200);
  });

  it("join は冪等（複数回参加してもメンバーは重複しない）", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);

    for (let i = 0; i < 3; i++) {
      const res = await SELF.fetch("https://api.test/api/rooms/join", {
        method: "POST",
        headers: {
          Cookie: await sessionCookie(MEMBER),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: inviteCode }),
      });
      expect(res.status).toBe(200);
    }

    const memberIds = await listMemberIds(roomId);
    expect(memberIds.sort()).toEqual([OWNER.sub, MEMBER.sub].sort());
  });

  it("通算20名に達したルームへの新規参加は409で拒否する", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);

    for (let index = 1; index <= 19; index++) {
      const user = {
        sub: `${index.toString().padStart(8, "0")}-0000-4000-8000-000000000000`,
        email: `member-${index}@example.test`,
        name: `Member ${index}`,
      };
      const joined = await SELF.fetch("https://api.test/api/rooms/join", {
        method: "POST",
        headers: {
          Cookie: await sessionCookie(user),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: inviteCode }),
      });
      expect(joined.status).toBe(200);
    }

    const overflowUser = {
      sub: "00000020-0000-4000-8000-000000000000",
      email: "member-20@example.test",
      name: "Member 20",
    };
    const rejected = await SELF.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: {
        Cookie: await sessionCookie(overflowUser),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: inviteCode }),
    });

    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({
      error: "このルームは20人までです。",
    });
    expect(await listMemberIds(roomId)).toHaveLength(20);
  });

  it("小文字や空白まじりの招待コードも補正して受け付ける", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    const res = await SELF.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: {
        Cookie: await sessionCookie(MEMBER),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: ` ${inviteCode.toLowerCase()} ` }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ roomId });
  });

  it("存在しない招待コードは 404", async () => {
    const res = await SELF.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: {
        Cookie: await sessionCookie(MEMBER),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: "ZZZZ99" }),
    });
    expect(res.status).toBe(404);
  });

  it("形式が不正な招待コードは 400", async () => {
    const res = await SELF.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: {
        Cookie: await sessionCookie(MEMBER),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: "ab" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("ユーザー同期（ログイン時の upsert）", () => {
  async function assertionFor(
    payload: Record<string, unknown>,
  ): Promise<string> {
    return signToken(payload, {
      secret: env.SESSION_SECRET,
      audience: TOKEN_AUDIENCE.loginAssertion,
      expiresInSeconds: 60,
    });
  }

  it("dev ログイン主張でユーザーが作成され、同じ ID で冪等に更新される", async () => {
    const assertion = await assertionFor({
      kind: "dev",
      userId: OWNER.sub,
      email: OWNER.email,
      name: OWNER.name,
    });

    for (let i = 0; i < 2; i++) {
      const res = await SELF.fetch("https://api.test/api/auth/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assertion }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ userId: OWNER.sub });
    }
  });

  it("google ログイン主張は googleSub で同一ユーザーに解決される", async () => {
    const assertion = await assertionFor({
      kind: "google",
      googleSub: "google-sub-123",
      email: "taro@example.test",
      name: "Taro",
    });

    const first = await SELF.fetch("https://api.test/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    });
    const { userId: firstId } = await first.json<{ userId: string }>();

    const second = await SELF.fetch("https://api.test/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    });
    const { userId: secondId } = await second.json<{ userId: string }>();

    expect(first.status).toBe(200);
    expect(firstId).toBe(secondId);
  });

  it("セッショントークンをログイン主張として流用できない（audience 分離）", async () => {
    const sessionToken = await signToken(
      { kind: "dev", userId: OWNER.sub, email: OWNER.email },
      {
        secret: env.SESSION_SECRET,
        audience: TOKEN_AUDIENCE.session,
        expiresInSeconds: 60,
      },
    );
    const res = await SELF.fetch("https://api.test/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion: sessionToken }),
    });
    expect(res.status).toBe(401);
  });
});

describe("退出（POST /api/rooms/:id/leave）", () => {
  it("メンバーは退出でき 204 を返す", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);

    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/leave`, {
      method: "POST",
      headers: { Cookie: await sessionCookie(MEMBER) },
    });
    expect(res.status).toBe(204);

    // 退出後のメンバー一覧には Member が居ない
    const membersRes = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/members`,
      { headers: { Cookie: await sessionCookie(OWNER) } },
    );
    const body = (await membersRes.json()) as { members: { userId: string }[] };
    expect(body.members.map((m) => m.userId)).toEqual([OWNER.sub]);
  });

  it("2 回目の退出は非メンバーのため 404（存在秘匿。クライアントは成功相当でよい）", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);

    const first = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/leave`,
      { method: "POST", headers: { Cookie: await sessionCookie(MEMBER) } },
    );
    expect(first.status).toBe(204);

    // 2 回目は既に非メンバー → 404（存在秘匿）
    const second = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/leave`,
      { method: "POST", headers: { Cookie: await sessionCookie(MEMBER) } },
    );
    expect(second.status).toBe(404);
  });

  it("ホストの leave はルームを解散し、D1 からも消える", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);

    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/leave`, {
      method: "POST",
      headers: { Cookie: await sessionCookie(OWNER) },
    });
    expect(res.status).toBe(204);

    // ルーム行が消えている → GET は 404
    const getRes = await SELF.fetch(`https://api.test/api/rooms/${roomId}`, {
      headers: { Cookie: await sessionCookie(MEMBER) },
    });
    expect(getRes.status).toBe(404);

    // 招待コードでも解決できない
    const joinRes = await SELF.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: {
        Cookie: await sessionCookie(MEMBER),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: inviteCode }),
    });
    expect(joinRes.status).toBe(404);
  });

  it("非メンバーは 404（ルームの存在自体を見せない）", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/leave`, {
      method: "POST",
      headers: { Cookie: await sessionCookie(OUTSIDER) },
    });
    expect(res.status).toBe(404);
  });

  it("未ログインは 401", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/leave`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("退出したユーザーは同じ招待コードから再 join できる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);

    // 退出
    await SELF.fetch(`https://api.test/api/rooms/${roomId}/leave`, {
      method: "POST",
      headers: { Cookie: await sessionCookie(MEMBER) },
    });

    // 再 join
    const rejoin = await SELF.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: {
        Cookie: await sessionCookie(MEMBER),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: inviteCode }),
    });
    expect(rejoin.status).toBe(200);
  });
});

describe("WebSocket 接続の認可", () => {
  it("セッションなしの WS 接続は 401", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(401);
  });

  it("非メンバーの WS 接続は 404", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/ws`, {
      headers: {
        Upgrade: "websocket",
        Cookie: await sessionCookie(OUTSIDER),
      },
    });
    expect(res.status).toBe(404);
  });

  it("メンバーの WS 接続は 101 で確立する", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/ws`, {
      headers: {
        Upgrade: "websocket",
        Cookie: await sessionCookie(OWNER),
      },
    });
    expect(res.status).toBe(101);
    res.webSocket?.accept();
    res.webSocket?.close();
  });

  it("クライアントが HOST_ID_HEADER を偽装しても api-worker が D1 の値で上書きする", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/ws`, {
      headers: {
        Upgrade: "websocket",
        Cookie: await sessionCookie(MEMBER),
        [HOST_ID_HEADER]: MEMBER.sub,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();

    const nextMessage = () =>
      new Promise<Record<string, unknown>>((resolve) => {
        ws.addEventListener(
          "message",
          (event) => resolve(JSON.parse(String(event.data))),
          { once: true },
        );
      });
    await expect(nextMessage()).resolves.toMatchObject({
      type: "snapshot",
      isHost: false,
    });

    ws.send(JSON.stringify({ type: "start_phase" }));
    await expect(nextMessage()).resolves.toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it("room_owner が NULL でも非ホストの偽装ヘッダーを無効化し D1 ホストでバックフィルする", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    await runInRoomDO(roomId, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room_owner SET host_id = NULL WHERE id = 1",
      );
    });

    const res = await SELF.fetch(`https://api.test/api/rooms/${roomId}/ws`, {
      headers: {
        Upgrade: "websocket",
        Cookie: await sessionCookie(MEMBER),
        [HOST_ID_HEADER]: MEMBER.sub,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    const nextMessage = () =>
      new Promise<Record<string, unknown>>((resolve) => {
        ws.addEventListener(
          "message",
          (event) => resolve(JSON.parse(String(event.data))),
          { once: true },
        );
      });

    await expect(nextMessage()).resolves.toMatchObject({
      type: "snapshot",
      isHost: false,
    });
    await runInRoomDO(roomId, (_instance, state) => {
      expect(
        state.storage.sql
          .exec("SELECT host_id FROM room_owner WHERE id = 1")
          .toArray(),
      ).toEqual([{ host_id: OWNER.sub }]);
    });

    ws.send(JSON.stringify({ type: "start_phase" }));
    await expect(nextMessage()).resolves.toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });
});

describe("GET /api/health（疎通確認用、認可不要）", () => {
  it("セッションなしでも 200 で ok:true を返す", async () => {
    const res = await SELF.fetch("https://api.test/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
