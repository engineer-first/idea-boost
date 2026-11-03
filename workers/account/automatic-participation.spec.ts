import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ParticipationResult } from "../../contracts/room-participation";
import {
  createRoomAs,
  joinRoomAs,
  listMemberIds,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";

const actor = {
  sub: "90511111-1111-4111-8111-111111111111",
  email: "905a@example.test",
  name: "移動する人",
};
const owner = {
  sub: "90522222-2222-4222-8222-222222222222",
  email: "905b@example.test",
  name: "作成者",
};
async function move(
  code: string,
  operationId: string,
): Promise<ParticipationResult> {
  const response = await exports.default.fetch(
    "https://api.test/api/room-participation/prepare",
    {
      method: "POST",
      headers: {
        Cookie: await sessionCookieFor(actor),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationId,
        expectedPrincipal: actor.sub,
        target: { kind: "join", code },
      }),
    },
  );
  return response.json();
}
describe("確認しない参加切替", () => {
  it("確認なしで退出・参加し、再送は退出や新しい移動を繰り返さない", async () => {
    const source = await createRoomAs(actor);
    const target = await createRoomAs(owner);
    await joinRoomAs(
      {
        sub: "90544444-4444-4444-8444-444444444444",
        email: "keeper905@example.test",
        name: "残る人",
      },
      source.inviteCode,
    );
    const sourceName = await runInRoomDO(source.roomId, (room) =>
      room.participationName(source.inviteCode),
    );
    const id = crypto.randomUUID();
    const [result, duplicate] = await Promise.all([
      move(target.inviteCode, id),
      move(target.inviteCode, id),
    ]);
    expect(duplicate).toEqual(result);
    expect(result).toMatchObject({
      kind: "ready",
      roomId: target.roomId,
      operationId: id,
      exitedRoomNames: [sourceName],
    });
    expect(await listMemberIds(source.roomId)).not.toContain(actor.sub);
    expect(await listMemberIds(target.roomId)).toContain(actor.sub);
    expect(await move(target.inviteCode, id)).toEqual(result);
    expect(await move(source.inviteCode, id)).toMatchObject({
      kind: "rejected",
      reason: "input_conflict",
    });
    await runInRoomDO(source.roomId, (_room, state) => {
      expect(
        state.storage.sql
          .exec(
            "SELECT COUNT(*) AS n FROM room_participation_receipts WHERE user_id=? AND operation_id=?",
            actor.sub,
            id,
          )
          .one(),
      ).toEqual({ n: 1 });
      expect(
        state.storage.sql
          .exec("SELECT user_id FROM retained_outcome_participants")
          .toArray(),
      ).toContainEqual({ user_id: actor.sub });
    });
  });
  it("別タブの同時要求でも未完了の在籍を二重にしない", async () => {
    const source = await createRoomAs(actor);
    const target = await createRoomAs(owner);
    const otherOwner = {
      ...owner,
      email: "other905@example.test",
      sub: "90533333-3333-4333-8333-333333333333",
    };
    const other = await createRoomAs(otherOwner);
    await Promise.all([
      move(target.inviteCode, crypto.randomUUID()),
      move(other.inviteCode, crypto.randomUUID()),
    ]);
    const members = await Promise.all(
      [source, target, other].map((room) => listMemberIds(room.roomId)),
    );
    expect(members.filter((ids) => ids.includes(actor.sub))).toHaveLength(1);
  });
  it("通常の参加には退出通知を付けない", async () => {
    const target = await createRoomAs(owner);
    expect(await move(target.inviteCode, crypto.randomUUID())).toMatchObject({
      kind: "ready",
      exitedRoomNames: [],
    });
  });
  it("元の退出後に結果保存の応答が失われてもサーバー内で同じ移動に収束する", async () => {
    const source = await createRoomAs(actor);
    await joinRoomAs(
      {
        sub: "90544444-4444-4444-8444-444444444444",
        email: "keeper905@example.test",
        name: "残る人",
      },
      source.inviteCode,
    );
    const target = await createRoomAs(owner);
    const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(actor.sub));
    const operationId = crypto.randomUUID();
    await runInDurableObject(account, async (instance) => {
      const original = Reflect.get(instance, "reconcileExits").bind(instance);
      let lost = false;
      Reflect.set(
        instance,
        "reconcileExits",
        async (userId: string, op: { phase: string }) => {
          await original(userId, op);
          if (op.phase === "joining" && !lost) {
            lost = true;
            throw new Error("保存応答の消失");
          }
        },
      );
      try {
        const result = await instance.prepare(
          actor.sub,
          { kind: "join", code: target.inviteCode },
          true,
          operationId,
        );
        expect(lost).toBe(true);
        expect(result).toMatchObject({
          kind: "ready",
          operationId,
          roomId: target.roomId,
          exitedRoomNames: [expect.any(String)],
        });
        expect(await instance.mayOperate(actor.sub, target.roomId)).toBe(true);
      } finally {
        Reflect.set(instance, "reconcileExits", original);
      }
    });
    expect(await listMemberIds(source.roomId)).not.toContain(actor.sub);
    expect(await listMemberIds(target.roomId)).toContain(actor.sub);
  });
  it("別タブで処理中と返した要求の再送を新しい移動にしない", async () => {
    await createRoomAs(actor);
    const target = await createRoomAs(owner);
    const other = await createRoomAs({
      sub: "90555555-5555-4555-8555-555555555555",
      email: "other905x@example.test",
      name: "別の人",
    });
    const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(actor.sub));
    const { issueCreationId } = await import("../../contracts/room-creation");
    const creationInput = {
      expectedPrincipal: actor.sub,
      requestId: issueCreationId().requestId,
    };
    const firstId = crypto.randomUUID(),
      otherId = crypto.randomUUID();
    await runInDurableObject(account, async (instance) => {
      const original = Reflect.get(instance, "admission").bind(instance);
      let attempts = 0;
      Reflect.set(instance, "admission", async () => {
        attempts++;
        throw new Error("一時障害");
      });
      try {
        expect(
          await instance.prepare(
            actor.sub,
            { kind: "join", code: target.inviteCode },
            true,
            firstId,
          ),
        ).toMatchObject({ kind: "pending" });
        expect(attempts).toBe(3);
        expect(
          await instance.prepare(
            actor.sub,
            { kind: "join", code: other.inviteCode },
            true,
            otherId,
          ),
        ).toMatchObject({ kind: "pending", operationId: firstId });
        expect(
          await instance.prepare(actor.sub, {
            kind: "create",
            input: creationInput,
          }),
        ).toMatchObject({ kind: "pending", operationId: firstId });
      } finally {
        Reflect.set(instance, "admission", original);
      }
    });
    const result = await account.status(actor.sub, firstId);
    expect(result).toMatchObject({ kind: "ready", roomId: target.roomId });
    expect(await move(other.inviteCode, otherId)).toEqual(result);
    expect(
      await account.prepare(actor.sub, {
        kind: "create",
        input: creationInput,
      }),
    ).toMatchObject({ kind: "rejected", reason: "input_conflict" });
    expect(await listMemberIds(other.roomId)).not.toContain(actor.sub);
  });
  it("作成の省略名と空欄の再送は同じ操作として扱う", async () => {
    await createRoomAs(actor);
    const { issueCreationId } = await import("../../contracts/room-creation");
    const input = {
      requestId: issueCreationId().requestId,
      expectedPrincipal: actor.sub,
    };
    const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(actor.sub));
    const result = await account.prepare(actor.sub, { kind: "create", input });
    expect(result.kind).toBe("ready");
    expect(
      await account.prepare(actor.sub, {
        kind: "create",
        input: { ...input, name: "  " },
      }),
    ).toEqual(result);
  });
  it("操作IDのない旧参加要求で元のルームを退出させない", async () => {
    const source = await createRoomAs(actor),
      target = await createRoomAs(owner);
    const response = await exports.default.fetch(
      "https://api.test/api/rooms/join",
      {
        method: "POST",
        headers: {
          Cookie: await sessionCookieFor(actor),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: target.inviteCode }),
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ reason: "update_required" });
    expect(await listMemberIds(source.roomId)).toContain(actor.sub);
    expect(await listMemberIds(target.roomId)).not.toContain(actor.sub);
  });
  it("旧複数在籍の整理後もルーム情報を返し、退出した名前を通知へ渡す", async () => {
    const source = await createRoomAs(actor);
    const { insertRoom } = await import("../lib/db");
    const { initializeTestRoom } = await import("../test-helpers");
    const old = await insertRoom(env.DB, actor.sub);
    await initializeTestRoom(
      env.ROOM_DO.get(env.ROOM_DO.idFromName(old.roomId)),
      actor.sub,
      actor.name,
      { roomId: old.roomId },
    );
    const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(actor.sub));
    await runInDurableObject(account, async (_instance, state) => {
      await state.storage.delete([
        "participation-index",
        "participation-index-ready",
        "participation-index-cursor",
      ]);
    });
    const response = await exports.default.fetch(
      `https://api.test/api/rooms/${source.roomId}`,
      { headers: { Cookie: await sessionCookieFor(actor) } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      roomId: source.roomId,
      phase: { kind: "lobby" },
      exitedRoomNames: [expect.any(String)],
    });
    expect(await listMemberIds(old.roomId)).not.toContain(actor.sub);
    expect(await listMemberIds(source.roomId)).toContain(actor.sub);
  });
});
