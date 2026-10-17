import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApiWorker } from "./api-worker";
import {
  createRoomAs,
  joinRoomAs,
  runInRoomDO,
  sessionCookieFor,
} from "./test-helpers";

function user() {
  const sub = crypto.randomUUID();
  return { sub, email: `${sub}@example.test`, name: "Googleの名前" };
}
async function save(
  actor: ReturnType<typeof user>,
  name: string,
  roomId?: string,
) {
  return SELF.fetch("https://api.test/api/me/display-name", {
    method: "PUT",
    headers: {
      Cookie: await sessionCookieFor(actor),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expectedPrincipal: actor.sub,
      name,
      ...(roomId ? { roomId } : {}),
    }),
  });
}
function members(roomId: string) {
  return env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).listMembers();
}
// 再参加先を残すため、ホスト交代済みの在籍をfixtureで準備して本人退出する。
async function leaveKeepingRoom(
  actor: ReturnType<typeof user>,
  roomId: string,
) {
  const successor = user();
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).upsertMember(
    successor.sub,
    "後任",
  );
  await runInRoomDO(roomId, (_room, state) =>
    state.storage.sql.exec(
      "UPDATE room_owner SET host_id=?,host_revision=host_revision+1 WHERE id=1",
      successor.sub,
    ),
  );
  const response = await SELF.fetch(
    `https://api.test/api/rooms/${roomId}/leave`,
    {
      method: "POST",
      headers: {
        Cookie: await sessionCookieFor(actor),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "self",
        outcomeAccess: "discard",
        expectedHostRevision: 1,
      }),
    },
  );
  expect(response.status).toBe(204);
}
describe("表示名を変更したルームと次の参加に反映する", () => {
  it("ホームの保存は在籍中のルームを変更せず、次の作成・再参加で使う", async () => {
    const actor = user();
    const room = await createRoomAs(actor);
    expect((await save(actor, "ホームで変更")).status).toBe(200);
    expect(await members(room.roomId)).toMatchObject([{ name: actor.name }]);
    const lookup = await SELF.fetch(
      `https://api.test/api/rooms/lookup?code=${room.inviteCode}`,
      { headers: { Cookie: await sessionCookieFor(actor) } },
    );
    expect(await lookup.json()).toMatchObject({ hostName: actor.name });
    await leaveKeepingRoom(actor, room.roomId);
    const next = await createRoomAs(actor);
    expect(await members(next.roomId)).toMatchObject([
      { name: "ホームで変更" },
    ]);
    await leaveKeepingRoom(actor, next.roomId);
    await joinRoomAs(actor, room.inviteCode);
    expect(
      (await members(room.roomId)).find(
        (member) => member.userId === actor.sub,
      ),
    ).toMatchObject({ name: "ホームで変更" });
  });
  it("指定した活動中のルームだけ変更し、完了ルームの閲覧では同期しない", async () => {
    const actor = user();
    const first = await createRoomAs(actor);
    await runInRoomDO(first.roomId, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE room_state SET outcome_published=1 WHERE id=1",
      ),
    );
    const second = await createRoomAs(actor);
    expect((await save(actor, "変更後", second.roomId)).status).toBe(200);
    expect(await members(second.roomId)).toMatchObject([{ name: "変更後" }]);
    for (const suffix of ["", "/members"]) {
      expect(
        (
          await SELF.fetch(
            `https://api.test/api/rooms/${first.roomId}${suffix}`,
            {
              headers: { Cookie: await sessionCookieFor(actor) },
            },
          )
        ).status,
      ).toBe(200);
    }
    expect(await members(first.roomId)).toMatchObject([{ name: actor.name }]);
  });
  it("他人のルーム・存在しないルームを指定しても設定や参加者を変更できない", async () => {
    const actor = user();
    expect((await save(actor, "本人の設定")).status).toBe(200);
    const other = await createRoomAs(user());
    for (const roomId of [other.roomId, crypto.randomUUID(), "invalid-id"]) {
      expect((await save(actor, "不正な変更", roomId)).status).toBe(
        roomId === "invalid-id" ? 400 : 404,
      );
      const response = await SELF.fetch(
        "https://api.test/api/me/display-name",
        {
          headers: { Cookie: await sessionCookieFor(actor) },
        },
      );
      expect(await response.json()).toEqual({ name: "本人の設定" });
    }
    expect(await members(other.roomId)).toMatchObject([
      { name: "Googleの名前" },
    ]);
  });
  it("完了済みルームへの変更は共通保存を保ち、409で即時反映できないことを返す", async () => {
    const actor = user();
    const room = await createRoomAs(actor);
    await runInRoomDO(room.roomId, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE room_state SET outcome_published=1 WHERE id=1",
      ),
    );
    const response = await save(actor, "次回の表示名", room.roomId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("保存しました"),
    });
    expect(await members(room.roomId)).toMatchObject([{ name: actor.name }]);
    const profile = await SELF.fetch("https://api.test/api/me/display-name", {
      headers: { Cookie: await sessionCookieFor(actor) },
    });
    expect(await profile.json()).toEqual({ name: "次回の表示名" });
  });
  it("ホームの変更ではRoomDOを呼び出さない", async () => {
    const actor = user();
    await createRoomAs(actor);
    const namespace = {
      idFromName: () => {
        throw new Error("ルームの配送は不要");
      },
    } as unknown as typeof env.ROOM_DO;
    const response = await createApiWorker().fetch(
      new Request("https://api.test/api/me/display-name", {
        method: "PUT",
        headers: {
          Cookie: await sessionCookieFor(actor),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedPrincipal: actor.sub,
          name: "ホームで保存",
        }),
      }),
      { ...env, ROOM_DO: namespace },
    );
    expect(response.status).toBe(200);
  });
});
