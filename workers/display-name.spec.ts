import { env, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueCreationId } from "../contracts/room-creation";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { signToken } from "../lib/session/token";
import { createApiWorker } from "./api-worker";
import {
  LEGACY_ROOM_DO_MIGRATION_IDS,
  migrateRoomStorage,
  ROOM_DO_MIGRATIONS,
} from "./room-do-migrations";
import { dropAllTables } from "./room-do-migrations/test-helpers";
import {
  connectRoomAs,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
} from "./test-helpers";

const A = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "a@example.test",
  name: "Googleの本名A",
};
const B = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "b@example.test",
  name: "Googleの本名B",
};
const sockets: RoomSocket[] = [];
beforeEach(() => {
  for (const user of [A, B]) {
    user.sub = crypto.randomUUID();
    user.email = `${user.sub}@example.test`;
  }
});
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});
async function profile(user = A, body?: unknown) {
  return SELF.fetch("https://api.test/api/me/display-name", {
    method: body === undefined ? "GET" : "PUT",
    headers: {
      Cookie: await sessionCookieFor(user),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function create(user = A) {
  return SELF.fetch("https://api.test/api/rooms", {
    method: "POST",
    headers: {
      Cookie: await sessionCookieFor(user),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: issueCreationId().requestId,
      expectedPrincipal: user.sub,
    }),
  });
}
async function join(code: string, user = B) {
  return SELF.fetch("https://api.test/api/rooms/join", {
    method: "POST",
    headers: {
      Cookie: await sessionCookieFor(user),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
}
describe("Google名を初期値にする共通の表示名", () => {
  it("未認証は本人設定を読めず、変更できない", async () => {
    for (const method of ["GET", "PUT"]) {
      const response = await SELF.fetch(
        "https://api.test/api/me/display-name",
        {
          method,
          ...(method === "PUT"
            ? { body: JSON.stringify({ name: "表示名" }) }
            : {}),
        },
      );
      expect(response.status).toBe(401);
    }
  });
  it("他人の指定と不正入力を拒否し、保存済みの表示名を失わない", async () => {
    expect(
      (await profile(A, { name: "はな", expectedPrincipal: A.sub })).status,
    ).toBe(200);
    for (const input of [
      { name: "別人", expectedPrincipal: B.sub },
      { name: "別人", expectedPrincipal: A.sub, userId: B.sub },
      { name: "", expectedPrincipal: A.sub },
      { name: "　 ", expectedPrincipal: A.sub },
      { name: "あ".repeat(16), expectedPrincipal: A.sub },
    ]) {
      expect((await profile(A, input)).status).toBeGreaterThanOrEqual(400);
      expect(await (await profile()).json()).toEqual({ name: "はな" });
    }
    expect(await (await profile(B)).json()).toEqual({ name: B.name });
  });
  it("表示名を変更していなければGoogle名で作成・参加し、招待にもGoogle名を使う", async () => {
    const response = await create();
    expect(response.status).toBe(200);
    const room = await response.json<{ roomId: string; inviteCode: string }>();
    const a = await connectRoomAs(A, room.roomId);
    sockets.push(a);
    expect(await a.next()).toMatchObject({
      type: "snapshot",
      members: [expect.objectContaining({ userId: A.sub, name: A.name })],
    });
    expect(await (await profile()).json()).toEqual({ name: A.name });
    expect((await join(room.inviteCode)).status).toBe(200);
    expect(await a.next()).toMatchObject({
      type: "member_joined",
      member: { userId: B.sub, name: B.name },
    });
    const lookup = await SELF.fetch(
      `https://api.test/api/rooms/lookup?code=${room.inviteCode}`,
      { headers: { Cookie: await sessionCookieFor(B) } },
    );
    expect(await lookup.json()).toMatchObject({ hostName: A.name });
  });
  it("本人が変更した表示名を参加・招待・共有通知で使い、Google名に戻さない", async () => {
    await profile(A, { name: "たろう", expectedPrincipal: A.sub });
    await profile(B, { name: "はな", expectedPrincipal: B.sub });
    const room = await (await create()).json<{
      roomId: string;
      inviteCode: string;
    }>();
    const a = await connectRoomAs(A, room.roomId);
    sockets.push(a);
    expect(JSON.stringify(await a.next())).not.toContain(A.name);
    await join(room.inviteCode);
    expect(JSON.stringify(await a.next())).not.toContain(B.name);
    const lookup = await SELF.fetch(
      `https://api.test/api/rooms/lookup?code=${room.inviteCode}`,
      { headers: { Cookie: await sessionCookieFor(B) } },
    );
    expect(await lookup.json()).toMatchObject({ hostName: "たろう" });
  });
  it("認証プロフィールの再同期で本人の表示名を上書きしない", async () => {
    expect(
      (await profile(A, { name: "  はな  ", expectedPrincipal: A.sub })).status,
    ).toBe(200);
    const assertion = await signToken(
      {
        kind: "google",
        googleSub: "google-a",
        email: A.email,
        name: "ログイン後のGoogle本名",
      },
      {
        secret: env.SESSION_SECRET,
        audience: TOKEN_AUDIENCE.loginAssertion,
        expiresInSeconds: 60,
      },
    );
    const sync = await SELF.fetch("https://api.test/api/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assertion }),
    });
    expect(sync.status).toBe(200);
    expect(await (await profile()).json()).toEqual({ name: "はな" });
  });
  it("表示名が別ルームと参加通知に引き継がれ、変更したルームの招待にも届く", async () => {
    await profile(A, { name: "たろう", expectedPrincipal: A.sub });
    await profile(B, { name: "はな", expectedPrincipal: B.sub });
    const first = await (await create()).json<{
      roomId: string;
      inviteCode: string;
    }>();
    const second = await (await create()).json<{
      roomId: string;
      inviteCode: string;
    }>();
    const a = await connectRoomAs(A, first.roomId);
    sockets.push(a);
    expect(JSON.stringify(await a.next())).toContain("たろう");
    expect((await join(first.inviteCode)).status).toBe(200);
    expect(await a.next()).toMatchObject({
      type: "member_joined",
      member: { userId: B.sub, name: "はな" },
    });
    // 同名でもID・色によって本人を区別する。
    expect(
      (
        await profile(A, {
          name: "はな",
          expectedPrincipal: A.sub,
          roomId: first.roomId,
        })
      ).status,
    ).toBe(200);
    expect(await a.next()).toMatchObject({
      type: "member:renamed",
      member: {
        userId: A.sub,
        name: "はな",
      },
    });
    for (const room of [first, second]) {
      const members = await SELF.fetch(
        `https://api.test/api/rooms/${room.roomId}/members`,
        { headers: { Cookie: await sessionCookieFor(A) } },
      );
      expect(await members.json()).toMatchObject({
        members: expect.arrayContaining([
          expect.objectContaining({
            userId: A.sub,
            name: room.roomId === first.roomId ? "はな" : "たろう",
          }),
        ]),
      });
    }
    const lookup = await SELF.fetch(
      `https://api.test/api/rooms/lookup?code=${first.inviteCode}`,
      { headers: { Cookie: await sessionCookieFor(B) } },
    );
    expect(await lookup.json()).toMatchObject({ hostName: "はな" });
  });
});

describe("共通表示名の配信先と移行", () => {
  it("新旧の更新が逆順に届いても戻さず、非メンバー・完了済みルームを改名しない", async () => {
    const room = await (await create()).json<{
      roomId: string;
      inviteCode: string;
    }>();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(room.roomId));
    await stub.syncAccountDisplayName(A.sub, "新しい名", 10);
    await stub.syncAccountDisplayName(A.sub, "古い名", 9);
    expect(await stub.listMembers()).toMatchObject([
      { userId: A.sub, name: "新しい名" },
    ]);
    expect(await stub.syncAccountDisplayName(B.sub, "侵入者", 11)).toBe(false);
    await runInRoomDO(room.roomId, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE room_state SET outcome_published=1 WHERE id=1",
      ),
    );
    expect(await stub.syncAccountDisplayName(A.sub, "完了後の名", 12)).toBe(
      false,
    );
    expect(await stub.listMembers()).toMatchObject([{ name: "新しい名" }]);
  });
  it("対象ルームの反映が失敗しても共通名を保ち、再保存で追いつく", async () => {
    const room = await (await create()).json<{ roomId: string }>();
    const namespace = {
      idFromName: (name: string) => env.ROOM_DO.idFromName(name),
      get: () => ({
        isMember: async () => true,
        syncAccountDisplayName: async () => {
          throw new Error("一時障害");
        },
      }),
    } as unknown as typeof env.ROOM_DO;
    const response = await createApiWorker().fetch(
      new Request("https://api.test/api/me/display-name", {
        method: "PUT",
        headers: {
          Cookie: await sessionCookieFor(A),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedPrincipal: A.sub,
          name: "変更後",
          roomId: room.roomId,
        }),
      }),
      { ...env, ROOM_DO: namespace },
    );
    expect(response.status).toBe(503);
    expect(await (await profile()).json()).toEqual({ name: "変更後" });
    expect(
      (
        await profile(A, {
          expectedPrincipal: A.sub,
          name: "変更後",
          roomId: room.roomId,
        })
      ).status,
    ).toBe(200);
    expect(
      await env.ROOM_DO.get(env.ROOM_DO.idFromName(room.roomId)).listMembers(),
    ).toMatchObject([{ name: "変更後" }]);
  });
  it("既存ルームのGoogle名と本人が選んだ表示名を移行時に保つ", async () => {
    await runInRoomDO(crypto.randomUUID(), (_room, state) => {
      dropAllTables(state.storage);
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS.filter((m) => m.id < "20261012021752"),
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      state.storage.sql.exec(
        "INSERT INTO members(user_id,name,color) VALUES(?,?,'yellow'),(?,?,'blue')",
        A.sub,
        A.name,
        B.sub,
        "本人が選んだ名",
      );
      state.storage.sql.exec(
        "INSERT INTO member_display_names(user_id,name) VALUES(?,?)",
        B.sub,
        "本人が選んだ名",
      );
      const sharing = {
        order: [
          { userId: A.sub, name: A.name, color: "yellow" },
          { userId: B.sub, name: "本人が選んだ名", color: "blue" },
        ],
      };
      state.storage.sql.exec(
        "INSERT INTO sharing_state(id,state_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json",
        JSON.stringify(sharing),
      );
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      const members = state.storage.sql
        .exec("SELECT user_id,name FROM members")
        .toArray();
      expect(JSON.stringify(members)).toContain(A.name);
      expect(JSON.stringify(members)).toContain("本人が選んだ名");
      expect(
        String(
          state.storage.sql.exec("SELECT state_json FROM sharing_state").one()
            .state_json,
        ),
      ).toContain(A.name);
    });
  });
});

it("共通名が未設定の旧利用者の再参加で、本人が選んだ旧ルーム名を失わない", async () => {
  const own = await (await create()).json<{
    roomId: string;
    inviteCode: string;
  }>();
  await runInRoomDO(own.roomId, (_room, state) => {
    state.storage.sql.exec(
      "DELETE FROM member_account_name_revisions WHERE user_id=?",
      A.sub,
    );
    state.storage.sql.exec(
      "INSERT INTO member_display_names(user_id,name) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name",
      A.sub,
      "選んだ旧表示名",
    );
    state.storage.sql.exec(
      "UPDATE members SET name=? WHERE user_id=?",
      "選んだ旧表示名",
      A.sub,
    );
  });
  expect((await join(own.inviteCode, A)).status).toBe(200);
  expect(
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(own.roomId)).listMembers(),
  ).toMatchObject([{ name: "選んだ旧表示名" }]);
});
