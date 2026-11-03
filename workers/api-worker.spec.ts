// api-worker の統合テスト。Supabase 時代の pgTAP テスト（認可の肯定/否定系・
// join の冪等性）をワーカー境界のテストとして移植したもの。
// - anon（セッションなし）は何もできない
// - 非メンバーにはルームの存在自体を見せない (404)
// - join は冪等（複数回呼んでもメンバーは重複しない）
import { env, exports } from "cloudflare:workers";
import { base64url } from "jose";
import { describe, expect, it } from "vitest";
import { buildLobbyPhase } from "../contracts/phase.fixture";
import { issueCreationId } from "../contracts/room-creation";
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
  const res = await exports.default.fetch("https://api.test/api/rooms", {
    method: "POST",
    headers: {
      Cookie: await sessionCookie(user),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: issueCreationId().requestId,
      expectedPrincipal: user.sub,
    }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

describe("認証ゲート（pgTAP: anon の視点）", () => {
  it("セッションなしではルームを作成できない", async () => {
    const res = await exports.default.fetch("https://api.test/api/rooms", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("セッションなしではルーム参加できない", async () => {
    const res = await exports.default.fetch("https://api.test/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "ABC234" }),
    });
    expect(res.status).toBe(401);
  });

  it("セッションなしではルーム情報を取得できない", async () => {
    const res = await exports.default.fetch(
      "https://api.test/api/rooms/11111111-1111-4111-8111-111111111111",
    );
    expect(res.status).toBe(401);
  });

  it("改ざんされたセッションは拒否される", async () => {
    const cookie = await sessionCookie(OWNER);
    const res = await exports.default.fetch("https://api.test/api/rooms", {
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

  it("作成者はホスト情報を含まないルーム情報を取得できる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}`,
      {
        headers: { Cookie: await sessionCookie(OWNER) },
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      roomId,
      inviteCode,
      phase: LOBBY,
    });
  });
});

describe("ルーム情報", () => {
  it("参加者はホスト情報を含まないルーム情報を取得できる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}`,
      {
        headers: { Cookie: await sessionCookie(MEMBER) },
      },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      roomId,
      inviteCode,
      phase: LOBBY,
    });
  });
});

describe("メンバー一覧（GET /api/rooms/:id/members）", () => {
  it("メンバーは name 付きの参加者一覧を取得できる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    const res = await exports.default.fetch(
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
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/members`,
      { headers: { Cookie: await sessionCookie(OUTSIDER) } },
    );
    expect(res.status).toBe(404);
  });

  it("セッションなしでは 401", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/members`,
    );
    expect(res.status).toBe(401);
  });
});

describe("可視性（pgTAP: 非メンバーの視点）", () => {
  it("非メンバーにはルームの存在自体を見せない (404)", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}`,
      {
        headers: { Cookie: await sessionCookie(OUTSIDER) },
      },
    );
    expect(res.status).toBe(404);
  });

  it("存在しないルームも同じ 404 を返す（存在の推測をさせない）", async () => {
    const res = await exports.default.fetch(
      "https://api.test/api/rooms/99999999-9999-4999-8999-999999999999",
      { headers: { Cookie: await sessionCookie(OUTSIDER) } },
    );
    expect(res.status).toBe(404);
  });
});

describe("ルーム参加（pgTAP: join_room）", () => {
  it("招待コードで参加すると、ルーム情報を取得できるようになる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);

    const before = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}`,
      {
        headers: { Cookie: await sessionCookie(MEMBER) },
      },
    );
    expect(before.status).toBe(404);

    const join = await exports.default.fetch(
      "https://api.test/api/rooms/join",
      {
        method: "POST",
        headers: {
          Cookie: await sessionCookie(MEMBER),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: inviteCode }),
      },
    );
    expect(join.status).toBe(200);
    expect(await join.json()).toEqual({ roomId });

    const after = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}`,
      {
        headers: { Cookie: await sessionCookie(MEMBER) },
      },
    );
    expect(after.status).toBe(200);
  });

  it("join は冪等（複数回参加してもメンバーは重複しない）", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);

    for (let i = 0; i < 3; i++) {
      const res = await exports.default.fetch(
        "https://api.test/api/rooms/join",
        {
          method: "POST",
          headers: {
            Cookie: await sessionCookie(MEMBER),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: inviteCode }),
        },
      );
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
      const joined = await exports.default.fetch(
        "https://api.test/api/rooms/join",
        {
          method: "POST",
          headers: {
            Cookie: await sessionCookie(user),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: inviteCode }),
        },
      );
      expect(joined.status).toBe(200);
    }

    const overflowUser = {
      sub: "00000020-0000-4000-8000-000000000000",
      email: "member-20@example.test",
      name: "Member 20",
    };
    const rejected = await exports.default.fetch(
      "https://api.test/api/rooms/join",
      {
        method: "POST",
        headers: {
          Cookie: await sessionCookie(overflowUser),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: inviteCode }),
      },
    );

    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({
      error: "このルームは20人までです。",
    });
    expect(await listMemberIds(roomId)).toHaveLength(20);
  });

  it("小文字や空白まじりの招待コードも補正して受け付ける", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    const res = await exports.default.fetch("https://api.test/api/rooms/join", {
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
    const res = await exports.default.fetch("https://api.test/api/rooms/join", {
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
    const res = await exports.default.fetch("https://api.test/api/rooms/join", {
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
      const res = await exports.default.fetch(
        "https://api.test/api/auth/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assertion }),
        },
      );
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

    const first = await exports.default.fetch(
      "https://api.test/api/auth/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assertion }),
      },
    );
    const { userId: firstId } = await first.json<{ userId: string }>();

    const second = await exports.default.fetch(
      "https://api.test/api/auth/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assertion }),
      },
    );
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
    const res = await exports.default.fetch("https://api.test/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion: sessionToken }),
    });
    expect(res.status).toBe(401);
  });
});

describe("退出（POST /api/rooms/:id/leave）", () => {
  it("旧ルームでも未認証・非在籍者の退出要求を拒否し、参加者の退出は本人だけに適用する", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    await runInRoomDO(roomId, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room_owner SET host_id = NULL WHERE id = 1",
      );
    });
    for (const [user, status] of [
      [null, 401],
      [OUTSIDER, 404],
      [MEMBER, 204],
    ] as const) {
      const res = await exports.default.fetch(
        `https://api.test/api/rooms/${roomId}/leave`,
        {
          method: "POST",
          headers: {
            ...(user ? { Cookie: await sessionCookie(user) } : {}),
            [HOST_ID_HEADER]: user?.sub ?? OWNER.sub,
          },
        },
      );
      expect(res.status).toBe(status);
      await runInRoomDO(roomId, (_instance, state) => {
        expect(
          state.storage.sql
            .exec("SELECT host_id FROM room_owner WHERE id = 1")
            .one().host_id,
        ).toBeNull();
      });
      expect(
        await env.DB.prepare("SELECT id FROM rooms WHERE id=?")
          .bind(roomId)
          .first(),
      ).not.toBeNull();
    }
    expect(await listMemberIds(roomId)).toEqual([OWNER.sub]);
  });

  it("作成者情報未補完の旧ルームでも本人が退出できる", async () => {
    const { roomId } = await createRoomAs(OWNER);
    await runInRoomDO(roomId, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room_owner SET host_id = NULL WHERE id = 1",
      );
    });
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/leave`,
      {
        method: "POST",
        headers: {
          Cookie: await sessionCookie(OWNER),
          [HOST_ID_HEADER]: OUTSIDER.sub,
        },
      },
    );
    expect(res.status).toBe(204);
    expect(
      await env.DB.prepare("SELECT id FROM rooms WHERE id=?")
        .bind(roomId)
        .first(),
    ).not.toBeNull();
    expect(await listMemberIds(roomId)).toEqual([]);
  });

  it("メンバーは退出でき 204 を返す", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);

    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/leave`,
      {
        method: "POST",
        headers: { Cookie: await sessionCookie(MEMBER) },
      },
    );
    expect(res.status).toBe(204);

    // 退出後のメンバー一覧には Member が居ない
    const membersRes = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/members`,
      { headers: { Cookie: await sessionCookie(OWNER) } },
    );
    const body = (await membersRes.json()) as { members: { userId: string }[] };
    expect(body.members.map((m) => m.userId)).toEqual([OWNER.sub]);
  });

  it("2 回目の退出は非メンバーのため 404（存在秘匿。クライアントは成功相当でよい）", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);

    const first = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/leave`,
      { method: "POST", headers: { Cookie: await sessionCookie(MEMBER) } },
    );
    expect(first.status).toBe(204);

    // 2 回目は既に非メンバー → 404（存在秘匿）
    const second = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/leave`,
      { method: "POST", headers: { Cookie: await sessionCookie(MEMBER) } },
    );
    expect(second.status).toBe(404);
  });

  it.each([{}, { intent: "disband", expectedHostRevision: 99 }])(
    "作成者の退出要求 %j は本人だけを退出させ、再送は在籍認可で拒否する",
    async (body) => {
      const { roomId, inviteCode } = await createRoomAs(OWNER);
      await joinRoomAs(MEMBER, inviteCode);
      const leave = () =>
        exports.default.fetch(`https://api.test/api/rooms/${roomId}/leave`, {
          method: "POST",
          headers: { Cookie: awaitCookie, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      const awaitCookie = await sessionCookie(OWNER);
      expect((await leave()).status).toBe(204);
      expect(await listMemberIds(roomId)).toEqual([MEMBER.sub]);
      expect((await leave()).status).toBe(404);
      const get = await exports.default.fetch(
        `https://api.test/api/rooms/${roomId}`,
        { headers: { Cookie: await sessionCookie(MEMBER) } },
      );
      expect(get.status).toBe(200);
    },
  );

  it("非メンバーは 404（ルームの存在自体を見せない）", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/leave`,
      {
        method: "POST",
        headers: { Cookie: await sessionCookie(OUTSIDER) },
      },
    );
    expect(res.status).toBe(404);
  });

  it("未ログインは 401", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/leave`,
      {
        method: "POST",
      },
    );
    expect(res.status).toBe(401);
  });

  it("退出したユーザーは同じ招待コードから再 join できる", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);

    // 退出
    await exports.default.fetch(`https://api.test/api/rooms/${roomId}/leave`, {
      method: "POST",
      headers: { Cookie: await sessionCookie(MEMBER) },
    });

    // 再 join
    const rejoin = await exports.default.fetch(
      "https://api.test/api/rooms/join",
      {
        method: "POST",
        headers: {
          Cookie: await sessionCookie(MEMBER),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: inviteCode }),
      },
    );
    expect(rejoin.status).toBe(200);
  });
});

describe("WebSocket 接続の認可", () => {
  it("セッションなしの WS 接続は 401", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/ws`,
      {
        headers: { Upgrade: "websocket" },
      },
    );
    expect(res.status).toBe(401);
  });

  it("非メンバーの WS 接続は 404", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/ws`,
      {
        headers: {
          Upgrade: "websocket",
          Cookie: await sessionCookie(OUTSIDER),
        },
      },
    );
    expect(res.status).toBe(404);
  });

  it("メンバーの WS 接続は 101 で確立する", async () => {
    const { roomId } = await createRoomAs(OWNER);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/ws`,
      {
        headers: {
          Upgrade: "websocket",
          Cookie: await sessionCookie(OWNER),
        },
      },
    );
    expect(res.status).toBe(101);
    res.webSocket?.accept();
    res.webSocket?.close();
  });

  it("クライアントが HOST_ID_HEADER を偽装してもホスト操作を受理しない", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/ws`,
      {
        headers: {
          Upgrade: "websocket",
          Cookie: await sessionCookie(MEMBER),
          [HOST_ID_HEADER]: MEMBER.sub,
        },
      },
    );
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
    });

    ws.send(
      JSON.stringify({
        type: "host:transfer",
        targetUserId: MEMBER.sub,
        expectedHostRevision: 0,
      }),
    );
    await expect(nextMessage()).resolves.toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it("作成者情報が空でも偽装ヘッダーでホスト操作を復活させない", async () => {
    const { roomId, inviteCode } = await createRoomAs(OWNER);
    await joinRoomAs(MEMBER, inviteCode);
    await runInRoomDO(roomId, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room_owner SET host_id = NULL WHERE id = 1",
      );
    });

    const res = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}/ws`,
      {
        headers: {
          Upgrade: "websocket",
          Cookie: await sessionCookie(MEMBER),
          [HOST_ID_HEADER]: MEMBER.sub,
        },
      },
    );
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
    });
    await runInRoomDO(roomId, (_instance, state) => {
      expect(
        state.storage.sql
          .exec("SELECT host_id FROM room_owner WHERE id = 1")
          .toArray(),
      ).toEqual([{ host_id: null }]);
    });

    ws.send(
      JSON.stringify({
        type: "host:transfer",
        targetUserId: MEMBER.sub,
        expectedHostRevision: 0,
      }),
    );
    await expect(nextMessage()).resolves.toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });
});

describe("GET /api/health（疎通確認用、認可不要）", () => {
  it("セッションなしでも 200 で ok:true を返す", async () => {
    const res = await exports.default.fetch("https://api.test/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

function nextHostMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    socket.addEventListener(
      "message",
      (event) => resolve(JSON.parse(String(event.data))),
      { once: true },
    ),
  );
}
async function connectHostTest(user: typeof OWNER, roomId: string) {
  const response = await exports.default.fetch(
    `https://api.test/api/rooms/${roomId}/ws`,
    {
      headers: { Upgrade: "websocket", Cookie: await sessionCookie(user) },
    },
  );
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("WSが接続できませんでした");
  socket.accept();
  const snapshot = await nextHostMessage(socket);
  return { socket, snapshot };
}
async function roomWithMembers() {
  const room = await createRoomAs(OWNER);
  await joinRoomAs(MEMBER, room.inviteCode);
  return room;
}

it("退出・除外済みの本人は情報取得・退出・WS接続を要求できない", async () => {
  const { roomId } = await roomWithMembers();
  await runInRoomDO(roomId, (room) => room.leave(MEMBER.sub));
  for (const [suffix, method, upgrade] of [
    ["", "GET", false],
    ["/members", "GET", false],
    ["/leave", "POST", false],
    ["/ws", "GET", true],
  ] as const) {
    const response = await exports.default.fetch(
      `https://api.test/api/rooms/${roomId}${suffix}`,
      {
        method,
        headers: {
          Cookie: await sessionCookie(MEMBER),
          ...(upgrade ? { Upgrade: "websocket" } : {}),
        },
      },
    );
    expect(response.status).toBe(404);
  }
  expect(await listMemberIds(roomId)).toEqual([OWNER.sub]);
});

it("参加者の再接続snapshotは他者の未共有メモを含まない", async () => {
  const { roomId } = await roomWithMembers();
  const old = await connectHostTest(OWNER, roomId);
  const current = await connectHostTest(MEMBER, roomId);
  const oldStart = nextHostMessage(old.socket);
  const currentStart = nextHostMessage(current.socket);
  current.socket.send(
    JSON.stringify({ type: "start_phase", expectedHostRevision: 1 }),
  );
  expect(await currentStart).toMatchObject({ type: "phase:updated" });
  await oldStart;
  const oldTimer = nextHostMessage(old.socket);
  const currentTimer = nextHostMessage(current.socket);
  current.socket.send(
    JSON.stringify({
      type: "timer:start",
      durationMs: 60_000,
      expectedHostRevision: 1,
    }),
  );
  expect(await currentTimer).toMatchObject({
    type: "timer:updated",
    timer: { status: "running" },
  });
  await oldTimer;
  for (const [socket, content] of [
    [old.socket, "作成者だけの未共有メモ"],
    [current.socket, "参加者だけの未共有メモ"],
  ] as const) {
    const inserted = nextHostMessage(socket);
    socket.send(JSON.stringify({ type: "note:create", content }));
    expect(await inserted).toMatchObject({
      type: "note:inserted",
      note: { content, visibility: "private" },
    });
  }
  old.socket.close();
  current.socket.close();
  const oldAgain = await connectHostTest(OWNER, roomId);
  const currentAgain = await connectHostTest(MEMBER, roomId);
  expect(oldAgain.snapshot.notes).toEqual([
    expect.objectContaining({
      authorId: OWNER.sub,
      content: "作成者だけの未共有メモ",
    }),
  ]);
  expect(currentAgain.snapshot.notes).toEqual([
    expect.objectContaining({
      authorId: MEMBER.sub,
      content: "参加者だけの未共有メモ",
    }),
  ]);
  expect(JSON.stringify(currentAgain.snapshot)).not.toContain(
    "作成者だけの未共有メモ",
  );
  oldAgain.socket.close();
  currentAgain.socket.close();
});

describe("作成要求の再送", () => {
  it("同IDの入力衝突を拒否する", async () => {
    const requestId = issueCreationId().requestId;
    const send = (name: string) =>
      exports.default.fetch("https://api.test/api/rooms", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, name, expectedPrincipal: OWNER.sub }),
      });
    const cookie = await sessionCookie(OWNER);
    expect((await send("first")).status).toBe(200);
    expect((await send("second")).status).toBe(409);
  });
  it("同時送信が同じルームに収束する", async () => {
    const requestId = issueCreationId().requestId;
    const cookie = await sessionCookie(OWNER);
    const send = () =>
      exports.default.fetch("https://api.test/api/rooms", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          name: "first",
          expectedPrincipal: OWNER.sub,
        }),
      });
    const responses = await Promise.all([send(), send()]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
  });
});

describe("ゲスト本人の同期と永続化", () => {
  async function sync(assertion: string | Record<string, unknown>) {
    return exports.default.fetch("https://api.test/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    });
  }
  async function signed(userId: string, displayName = "はな", options = {}) {
    return signToken(
      { kind: "guest", userId, displayName },
      {
        secret: env.SESSION_SECRET,
        audience: TOKEN_AUDIENCE.loginAssertion,
        expiresInSeconds: 60,
        ...options,
      },
    );
  }
  async function row(id: string) {
    return env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  }
  it("署名したゲスト主張でemailとnameがNULL・表示名と更新番号が設定された本人を登録する", async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare("DELETE FROM user_permissions").run();
    const response = await sync(await signed(id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: id });
    expect(await row(id)).toMatchObject({
      id,
      email: null,
      name: null,
      google_sub: null,
      display_name: "はな",
      display_name_revision: 1,
    });
    expect(
      (await env.DB.prepare("SELECT * FROM user_permissions").all()).results,
    ).toEqual([]);
  });
  it("同じ主張の再送や別の表示名を含む再送でも本人と保存済み表示名を維持する", async () => {
    const id = crypto.randomUUID();
    const assertion = await signed(id);
    expect((await sync(assertion)).status).toBe(200);
    await env.DB.prepare(
      "UPDATE users SET display_name='保存済み', display_name_revision=7 WHERE id=?",
    )
      .bind(id)
      .run();
    const before = await row(id);
    for (const token of [assertion, await signed(id, "別の名前")]) {
      const response = await sync(token);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ userId: id });
      expect(await row(id)).toEqual(before);
    }
  });
  it("同じ名前でも異なるIDの主張は2人の本人として登録する", async () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (const id of ids) {
      const response = await sync(await signed(id));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ userId: id });
    }
    expect(
      (
        await env.DB.prepare(
          "SELECT id FROM users WHERE id IN (?,?) AND display_name='はな'",
        )
          .bind(...ids)
          .all()
      ).results,
    ).toHaveLength(2);
  });
  it.each(["メールあり", "Google連携あり"])(
    "%sのアカウントIDと衝突したら409で全列を保持する",
    async (condition) => {
      const id = crypto.randomUUID();
      // email NULLのGoogle行も、ゲスト化の対象にならない。
      await env.DB.prepare(
        "INSERT INTO users(id,email,name,google_sub,display_name,display_name_revision) VALUES(?,?,?,?,?,?)",
      )
        .bind(
          id,
          condition === "メールあり" ? `${id}@example.test` : null,
          "本人",
          condition === "Google連携あり" ? `google:${id}` : null,
          "保存済み",
          3,
        )
        .run();
      const before = await row(id);
      expect((await sync(await signed(id))).status).toBe(409);
      expect(await row(id)).toEqual(before);
    },
  );
  it("assertionがJSONオブジェクトなら400でユーザーを作らない", async () => {
    const id = crypto.randomUUID();
    const response = await sync({
      kind: "guest",
      userId: id,
      displayName: "はな",
    });
    expect(response.status).toBe(400);
    expect(await row(id)).toBeNull();
  });
  it.each(["無署名", "別秘密", "別audience"])(
    "%sのゲスト主張は401でユーザーを作らない",
    async (condition) => {
      const id = crypto.randomUUID();
      const assertion =
        condition === "無署名"
          ? `${base64url.encode(JSON.stringify({ alg: "none", typ: "JWT" }))}.${base64url.encode(
              JSON.stringify({
                iss: "idea-boost",
                aud: TOKEN_AUDIENCE.loginAssertion,
                exp: Math.floor(Date.now() / 1000) + 60,
                kind: "guest",
                userId: id,
                displayName: "はな",
              }),
            )}.`
          : await signed(
              id,
              "はな",
              condition === "別秘密"
                ? { secret: "other-test-session-secret-long-enough" }
                : { audience: TOKEN_AUDIENCE.session },
            );
      expect((await sync(assertion)).status).toBe(401);
      expect(await row(id)).toBeNull();
    },
  );
  it("期限切れの署名済みゲスト主張は401で本人行を作らない", async () => {
    const id = crypto.randomUUID();
    const assertion = await signed(id, "はな", {
      expiresAtSeconds: Math.floor(Date.now() / 1000) - 60,
    });
    expect((await sync(assertion)).status).toBe(401);
    expect(await row(id)).toBeNull();
  });
  it("D1に本人行がないゲストCookieからルームを作成してもFK違反にならない", async () => {
    const id = crypto.randomUUID();
    expect(await row(id)).toBeNull();
    const token = await signToken(
      { kind: "guest", sub: id, email: null },
      {
        secret: env.SESSION_SECRET,
        audience: TOKEN_AUDIENCE.session,
        expiresInSeconds: 600,
      },
    );
    const response = await exports.default.fetch("https://api.test/api/rooms", {
      method: "POST",
      headers: {
        Cookie: `idea_boost_session=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: issueCreationId().requestId,
        expectedPrincipal: id,
      }),
    });
    expect(response.status).toBe(200);
    expect(await row(id)).toMatchObject({ id, email: null });
    const room = await response.json<{ roomId: string }>();
    expect(
      await env.DB.prepare("SELECT host_id FROM rooms WHERE id=?")
        .bind(room.roomId)
        .first(),
    ).toEqual({ host_id: id });
    expect(
      (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
});

describe("ゲストの入室前更新API", () => {
  const url = "https://api.test/api/auth/guest/refresh";
  async function seed(
    email: string | null = null,
    googleSub: string | null = null,
  ) {
    const sub = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users(id,email,google_sub,display_name,display_name_revision) VALUES(?,?,?,?,?)",
    )
      .bind(sub, email, googleSub, "保存済みの名前", 7)
      .run();
    return { kind: "guest" as const, sub, email: null };
  }
  async function rows() {
    return (await env.DB.prepare("SELECT * FROM users ORDER BY id").all())
      .results;
  }
  async function cookie(payload: Record<string, unknown>, options = {}) {
    return `idea_boost_session=${await signToken(payload, {
      secret: env.SESSION_SECRET,
      audience: TOKEN_AUDIENCE.session,
      expiresInSeconds: 600,
      ...options,
    })}`;
  }

  it.each(["本文なし", "別人のIDを含む本文", "不正JSONの本文"])(
    "%sでも署名済みゲストsubだけを返しD1を変更しない",
    async (condition) => {
      const guest = await seed();
      const other = await seed();
      const before = await rows();
      const response = await exports.default.fetch(url, {
        method: "POST",
        headers: {
          Cookie: await cookie(guest),
          "Content-Type": "application/json",
        },
        ...(condition === "本文なし"
          ? {}
          : {
              body:
                condition === "不正JSONの本文"
                  ? "{"
                  : JSON.stringify({ userId: other.sub, exp: 9999999999 }),
            }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ userId: guest.sub });
      expect(await rows()).toEqual(before);
    },
  );

  it.each(["セッションなし", "期限切れ", "別秘密"])(
    "%sは401でD1を変更しない",
    async (condition) => {
      const guest = await seed();
      const before = await rows();
      const token =
        condition === "セッションなし"
          ? undefined
          : await cookie(
              guest,
              condition === "期限切れ"
                ? { expiresInSeconds: -1 }
                : { secret: "another-secret-with-more-than-32-bytes" },
            );
      const response = await exports.default.fetch(url, {
        method: "POST",
        headers: token ? { Cookie: token } : {},
      });
      expect(response.status).toBe(401);
      expect(await rows()).toEqual(before);
    },
  );

  it("accountセッションは403でD1を変更しない", async () => {
    const guest = await seed();
    const before = await rows();
    const response = await exports.default.fetch(url, {
      method: "POST",
      headers: {
        Cookie: await cookie({
          ...guest,
          kind: "account",
          email: "account@example.test",
        }),
      },
    });
    expect(response.status).toBe(403);
    expect(await rows()).toEqual(before);
  });

  it("D1に行がなければ404で本人行を作らない", async () => {
    const before = await rows();
    const response = await exports.default.fetch(url, {
      method: "POST",
      headers: {
        Cookie: await cookie({
          kind: "guest",
          sub: crypto.randomUUID(),
          email: null,
        }),
      },
    });
    expect(response.status).toBe(404);
    expect(await rows()).toEqual(before);
  });

  it.each(["email", "google_sub"])(
    "D1の%sが設定済みなら409で全行を変更しない",
    async (column) => {
      const guest = await seed(
        column === "email" ? "linked@example.test" : null,
        column === "google_sub" ? "linked-google-sub" : null,
      );
      const before = await rows();
      const response = await exports.default.fetch(url, {
        method: "POST",
        headers: { Cookie: await cookie(guest) },
      });
      expect(response.status).toBe(409);
      expect(await rows()).toEqual(before);
    },
  );
});

describe("Google本人の入室前更新API", () => {
  const url = "https://api.test/api/auth/account/refresh";
  it.each([
    "有効",
    "紐付けなし",
    "本人行なし",
    "期限切れ",
    "署名不正",
    "Cookieなし",
    "guest",
  ])(
    "%sの場合に検証済subのGoogle紐付けだけで更新可否を決める",
    async (condition) => {
      const sub = crypto.randomUUID();
      if (condition !== "本人行なし")
        await env.DB.prepare(
          "INSERT INTO users(id,email,google_sub) VALUES(?,?,?)",
        )
          .bind(
            sub,
            `${sub}@example.test`,
            condition === "紐付けなし" ? null : `google-${sub}`,
          )
          .run();
      const before = (
        await env.DB.prepare("SELECT * FROM users ORDER BY id").all()
      ).results;
      const token = await signToken(
        {
          kind: condition === "guest" ? "guest" : "account",
          sub,
          email: condition === "guest" ? null : `${sub}@example.test`,
        },
        {
          secret:
            condition === "署名不正"
              ? "another-secret-with-more-than-32-bytes"
              : env.SESSION_SECRET,
          audience: TOKEN_AUDIENCE.session,
          expiresInSeconds: condition === "期限切れ" ? -1 : 17999,
        },
      );
      const response = await exports.default.fetch(url, {
        method: "POST",
        headers:
          condition === "Cookieなし"
            ? {}
            : { Cookie: `idea_boost_session=${token}` },
        body: JSON.stringify({ userId: crypto.randomUUID(), exp: 9999999999 }),
      });
      expect(response.status).toBe(
        condition === "有効"
          ? 200
          : condition === "紐付けなし"
            ? 409
            : condition === "本人行なし"
              ? 404
              : condition === "guest"
                ? 403
                : 401,
      );
      if (response.ok) expect(await response.json()).toEqual({ userId: sub });
      expect(
        (await env.DB.prepare("SELECT * FROM users ORDER BY id").all()).results,
      ).toEqual(before);
    },
  );
});
