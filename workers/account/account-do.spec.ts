import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { issueCreationId } from "../../contracts/room-creation";
import type { ParticipationResult } from "../../contracts/room-participation";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  listMemberIds,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";

const A = {
  sub: "63111111-1111-4111-8111-111111111111",
  email: "a631@example.test",
  name: "移動する人",
};
const B = {
  sub: "63222222-2222-4222-8222-222222222222",
  email: "b632@example.test",
  name: "引継ぎ先",
};
const C = {
  sub: "63333333-3333-4333-8333-333333333333",
  email: "c633@example.test",
  name: "移動先のホスト",
};
async function prepare(code: string): Promise<ParticipationResult> {
  return (
    await SELF.fetch("https://api.test/api/room-participation/prepare", {
      method: "POST",
      headers: {
        Cookie: await sessionCookieFor(A),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target: { kind: "join", code },
        expectedPrincipal: A.sub,
      }),
    })
  ).json();
}
async function commit(
  operationId: string,
  outcomeAccess = "discard",
  confirmationVersion = 0,
): Promise<ParticipationResult> {
  return (
    await SELF.fetch("https://api.test/api/room-participation/commit", {
      method: "POST",
      headers: {
        Cookie: await sessionCookieFor(A),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationId,
        expectedPrincipal: A.sub,
        outcomeAccess,
        confirmationVersion,
      }),
    })
  ).json();
}
function confirmation(result: ParticipationResult) {
  if (result.kind !== "confirmation") throw new Error(JSON.stringify(result));
  return result.confirmation;
}
describe("アカウントの参加切替", () => {
  it("確認だけでは退出せず、決定後は元の全接続と古い再送を失効させる", async () => {
    const source = await createRoomAs(A);
    const target = await createRoomAs(C);
    const socket = await connectRoomAs(A, source.roomId);
    await socket.next();
    const prepared = confirmation(await prepare(target.inviteCode));
    expect(prepared.sources[0].action).toBe("disband");
    expect(await listMemberIds(source.roomId)).toContain(A.sub);
    const result = await commit(prepared.operationId);
    expect(result).toMatchObject({ kind: "ready", roomId: target.roomId });
    expect(await listMemberIds(source.roomId)).not.toContain(A.sub);
    expect(await listMemberIds(target.roomId)).toContain(A.sub);
    expect(await commit(prepared.operationId)).toEqual(result);
    const old = await SELF.fetch(
      `https://api.test/api/rooms/${source.roomId}/ws`,
      { headers: { Cookie: await sessionCookieFor(A), Upgrade: "websocket" } },
    );
    expect(old.status).toBe(404);
    socket.close();
  });
  it("候補の接続変化を再確認し、勝手な解散に変更しない", async () => {
    const source = await createRoomAs(A);
    await joinRoomAs(B, source.inviteCode);
    const socket = await connectRoomAs(B, source.roomId);
    await socket.next();
    const target = await createRoomAs(C);
    const prepared = confirmation(await prepare(target.inviteCode));
    expect(prepared.sources[0].successor?.name).toBe(B.name);
    await runInRoomDO(source.roomId, (room) => room.leave(B.sub));
    socket.close();
    const changed = await commit(prepared.operationId);
    expect(changed).toMatchObject({
      kind: "confirmation",
      reason: "state_changed",
    });
    expect(confirmation(changed).sources[0].action).toBe("disband");
    expect(await listMemberIds(source.roomId)).toContain(A.sub);
  });
  it("同時にBとCへ移る要求は一方だけを確定し、同じルームの複数画面は許す", async () => {
    const source = await createRoomAs(A);
    const target = await createRoomAs(B);
    const other = await createRoomAs(C);
    const one = confirmation(await prepare(target.inviteCode));
    const two = confirmation(await prepare(other.inviteCode));
    const results = await Promise.all([
      commit(one.operationId),
      commit(two.operationId),
    ]);
    expect(results.filter((r) => r.kind === "ready")).toHaveLength(1);
    const memberships = await Promise.all([
      listMemberIds(target.roomId),
      listMemberIds(other.roomId),
    ]);
    expect(memberships.filter((m) => m.includes(A.sub))).toHaveLength(1);
    expect(await listMemberIds(source.roomId)).not.toContain(A.sub);
    const ready = results.find((r) => r.kind === "ready");
    if (ready?.kind !== "ready") throw new Error("readyなし");
    const x = await connectRoomAs(A, ready.roomId);
    const y = await connectRoomAs(A, ready.roomId);
    await x.next();
    await y.next();
    x.close();
    y.close();
  });
  it("source退出後にAccountの応答が失われてもreceiptから続行し、成果選択を変えない", async () => {
    const source = await createRoomAs(B);
    await joinRoomAs(A, source.inviteCode);
    const target = await createRoomAs(C);
    const prepared = confirmation(await prepare(target.inviteCode));
    const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(A.sub));
    await runInDurableObject(account, async (_account, state) => {
      const key = `op:${prepared.operationId}`;
      const op = await state.storage.get<Record<string, unknown>>(key);
      if (!op) throw new Error("operationなし");
      op.phase = "leaving";
      op.generation = 1;
      op.outcomeAccess = "retain";
      await state.storage.put(key, op);
      await state.storage.put("active", prepared.operationId);
    });
    const dest = env.ROOM_DO.get(env.ROOM_DO.idFromName(target.roomId));
    expect(
      await dest.reserveParticipation(A.sub, prepared.operationId, 1),
    ).toBe("ok");
    const src = env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId));
    expect(
      await src.leaveForParticipation(
        A.sub,
        prepared.operationId,
        prepared.sources[0],
        B.sub,
        "retain",
        1,
      ),
    ).toBe("left");
    const recovered = await account.status(A.sub, prepared.operationId);
    expect(recovered).toMatchObject({ kind: "ready", roomId: target.roomId });
    expect(await listMemberIds(source.roomId)).not.toContain(A.sub);
    await runInRoomDO(source.roomId, (_room, state) =>
      expect(
        state.storage.sql
          .exec("SELECT user_id FROM retained_outcome_participants")
          .toArray(),
      ).toContainEqual({ user_id: A.sub }),
    );
  });
  it("別本人には操作の結果を見せず、旧作成要求は新たな移動にならない", async () => {
    const id = issueCreationId().requestId;
    const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(A.sub));
    // ユーザーFKを既存作成で用意する。
    const source = await createRoomAs(A);
    const dest = await createRoomAs(C);
    const prepared = confirmation(await prepare(dest.inviteCode));
    expect(await account.status(B.sub, prepared.operationId)).toMatchObject({
      kind: "rejected",
      reason: "not_found",
    });
    expect(
      await account.prepare(
        A.sub,
        { kind: "create", input: { expectedPrincipal: A.sub, requestId: id } },
        false,
      ),
    ).toMatchObject({ kind: "confirmation" });
    expect(await listMemberIds(source.roomId)).toContain(A.sub);
  });
});

it("legacy複数在籍を端末履歴なしで検出し、同意までは登録を保ちながら操作を止める", async () => {
  const first = await createRoomAs(A);
  const socket = await connectRoomAs(A, first.roomId);
  await socket.next();
  const { insertRoom } = await import("../lib/db");
  const { initializeTestRoom } = await import("../test-helpers");
  const old = await insertRoom(env.DB, A.sub);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(old.roomId));
  await initializeTestRoom(stub, A.sub, A.name, { roomId: old.roomId });
  const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(A.sub));
  expect(await account.mayOperate(A.sub, first.roomId)).toBe(false);
  const result = await account.inspect(A.sub, first.roomId);
  if (!result) throw new Error("legacy未検出");
  expect(confirmation(result).sources.map((s) => s.roomId)).toEqual([
    old.roomId,
  ]);
  expect(await listMemberIds(first.roomId)).toContain(A.sub);
  expect(await listMemberIds(old.roomId)).toContain(A.sub);
  socket.ws.send(
    JSON.stringify({
      type: "timer:start",
      durationMs: 60000,
      expectedHostRevision: 0,
    }),
  );
  expect(await socket.next()).toMatchObject({
    type: "error",
    code: "forbidden",
  });
  expect(await commit(confirmation(result).operationId)).toMatchObject({
    kind: "ready",
    roomId: first.roomId,
  });
  expect(await account.mayOperate(A.sub, first.roomId)).toBe(true);
  expect(await listMemberIds(old.roomId)).not.toContain(A.sub);
  socket.close();
});

it("参加枠の仮確保は操作権を与えず、取消・期限切れで枠を戻す", async () => {
  const target = await createRoomAs(C);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(target.roomId));
  for (let i = 0; i < 18; i++)
    await stub.upsertMember(`reserved-${i}`, "在籍者");
  const one = crypto.randomUUID(),
    two = crypto.randomUUID();
  expect(await stub.reserveParticipation(A.sub, one, 1)).toBe("ok");
  expect(await stub.isMember(A.sub)).toBe(false);
  expect(await stub.reserveParticipation(B.sub, two, 1)).toBe("room-full");
  await stub.cancelParticipationReservation(A.sub, one);
  expect(await stub.reserveParticipation(B.sub, two, 1)).toBe("ok");
  await runInRoomDO(target.roomId, (_room, state) =>
    state.storage.sql.exec(
      "UPDATE room_participation_reservations SET expires_at=?",
      Date.now() - 1,
    ),
  );
  expect(await stub.reserveParticipation(A.sub, one, 1)).toBe("ok");
});

it("古い参加commitと退出RPCが遅れても新世代の参加を変更しない", async () => {
  const target = await createRoomAs(C);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(target.roomId));
  const old = crypto.randomUUID(),
    next = crypto.randomUUID();
  expect(await stub.reserveParticipation(A.sub, old, 1)).toBe("ok");
  expect(await stub.commitParticipation(A.sub, A.name, old, 1)).toBe("ok");
  const preview = await stub.participationPreview(
    A.sub,
    target.roomId,
    target.inviteCode,
    C.sub,
  );
  if (!preview) throw new Error("previewなし");
  await stub.leave(A.sub, "discard");
  expect(await stub.commitParticipation(A.sub, A.name, old, 1)).toBe("ok");
  expect(await stub.isMember(A.sub)).toBe(false);
  expect(await stub.reserveParticipation(A.sub, next, 2)).toBe("ok");
  expect(await stub.commitParticipation(A.sub, A.name, next, 2)).toBe("ok");
  expect(await stub.commitParticipation(A.sub, A.name, old, 1)).toBe("stale");
  expect(
    await stub.leaveForParticipation(
      A.sub,
      crypto.randomUUID(),
      preview,
      C.sub,
      "discard",
      1,
    ),
  ).toBe("changed");
  expect(await stub.isMember(A.sub)).toBe(true);
});

it("接続中の参加順で交代し、ホストと退出をまとめて確定して進行・タイマーを維持する", async () => {
  const source = await createRoomAs(A);
  await joinRoomAs(B, source.inviteCode);
  const socket = await connectRoomAs(B, source.roomId);
  await socket.next();
  const target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  await runInRoomDO(source.roomId, (_room, state) =>
    state.storage.sql.exec(
      "UPDATE timer_state SET status='running',duration_ms=60000,ends_at=?,remaining_ms=NULL WHERE id=1",
      Date.now() + 60000,
    ),
  );
  const before = await runInRoomDO(source.roomId, (room, state) => ({
    phase: room.getPhase(),
    timer: state.storage.sql.exec("SELECT * FROM timer_state").one(),
  }));
  expect(await commit(prepared.operationId)).toMatchObject({
    kind: "ready",
    roomId: target.roomId,
  });
  await runInRoomDO(source.roomId, (room, state) => {
    expect(room.getCurrentHost().hostUserId).toBe(B.sub);
    expect(room.getPhase()).toEqual(before.phase);
    expect(state.storage.sql.exec("SELECT * FROM timer_state").one()).toEqual(
      before.timer,
    );
    expect(room.isMember(A.sub)).toBe(false);
  });
  socket.close();
});
it("ready保存後の停止で古いactiveが残っても成功先を操作できる", async () => {
  const source = await createRoomAs(A),
    target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  expect(await commit(prepared.operationId)).toMatchObject({ kind: "ready" });
  const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(A.sub));
  await runInDurableObject(account, async (_account, state) =>
    state.storage.put("active", prepared.operationId),
  );
  expect(await account.mayOperate(A.sub, target.roomId)).toBe(true);
  expect(await account.inspect(A.sub, target.roomId)).toBeNull();
  expect(await listMemberIds(source.roomId)).not.toContain(A.sub);
});
it("再訪の不存在と非メンバーを同じ応答にして存在を漏らさない", async () => {
  const room = await createRoomAs(C);
  async function lookup(roomId: string) {
    return (
      await SELF.fetch("https://api.test/api/room-participation/prepare", {
        method: "POST",
        headers: {
          Cookie: await sessionCookieFor(A),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedPrincipal: A.sub,
          target: { kind: "revisit", roomId },
        }),
      })
    ).json();
  }
  expect(await lookup(room.roomId)).toEqual(await lookup(crypto.randomUUID()));
});
it("古い途中操作のactive解除後に新移動が確定しても旧操作を再開しない", async () => {
  const source = await createRoomAs(A),
    oldTarget = await createRoomAs(B),
    newTarget = await createRoomAs(C);
  const old = confirmation(await prepare(oldTarget.inviteCode));
  const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(A.sub));
  await runInDurableObject(account, async (_account, state) => {
    const op = await state.storage.get<Record<string, unknown>>(
      `op:${old.operationId}`,
    );
    if (!op) throw new Error("opなし");
    op.phase = "joining";
    op.generation = 1;
    await state.storage.put(`op:${old.operationId}`, op);
    await state.storage.put("generation", 1);
  });
  const next = confirmation(await prepare(newTarget.inviteCode));
  expect(await commit(next.operationId)).toMatchObject({
    kind: "ready",
    roomId: newTarget.roomId,
  });
  expect(await account.status(A.sub, old.operationId)).toMatchObject({
    kind: "rejected",
    reason: "stale_operation",
  });
  expect(await listMemberIds(oldTarget.roomId)).not.toContain(A.sub);
  expect(await listMemberIds(source.roomId)).not.toContain(A.sub);
});
it("完了済み操作でも同じIDで成果の選択を変更した要求を拒否する", async () => {
  await createRoomAs(A);
  const target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  expect(await commit(prepared.operationId, "discard")).toMatchObject({
    kind: "ready",
  });
  expect(await commit(prepared.operationId, "retain")).toMatchObject({
    kind: "rejected",
    reason: "input_conflict",
  });
});

async function suspendMove(
  operationId: string,
  phase: "leaving" | "joining",
  left: string[] = [],
) {
  const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(A.sub));
  await runInDurableObject(account, async (_account, state) => {
    const key = `op:${operationId}`;
    const op = await state.storage.get<Record<string, unknown>>(key);
    if (!op) throw new Error("opなし");
    op.phase = phase;
    op.generation = 1;
    op.left = left;
    await state.storage.put(key, op);
    await state.storage.put("generation", 1);
    await state.storage.put("active", operationId);
  });
  return account;
}
async function expireAndFill(roomId: string, operationId: string) {
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  expect(await stub.reserveParticipation(A.sub, operationId, 1)).toBe("ok");
  await runInRoomDO(roomId, (_room, state) =>
    state.storage.sql.exec(
      "UPDATE room_participation_reservations SET expires_at=?",
      Date.now() - 1,
    ),
  );
  for (let i = 0; i < 19; i++)
    expect(await stub.upsertMember(`capacity-${i}`, "在籍者")).toEqual({
      ok: true,
    });
  return stub;
}
it.each([
  "full",
  "closed",
] as const)("停止中に予約が失効して移動先が%sなら、再開しても元ホスト・在籍・招待URLを保つ", async (reason) => {
  const source = await createRoomAs(A),
    target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  const account = await suspendMove(prepared.operationId, "leaving");
  if (reason === "full")
    await expireAndFill(target.roomId, prepared.operationId);
  else {
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(target.roomId));
    expect(
      await stub.reserveParticipation(A.sub, prepared.operationId, 1),
    ).toBe("ok");
    await stub.disband(C.sub);
  }
  const result = await account.status(A.sub, prepared.operationId);
  const original = env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId));
  expect(await original.isMember(A.sub)).toBe(true);
  expect(await original.isJoinable()).toBe(true);
  expect((await original.getCurrentHost()).hostUserId).toBe(A.sub);
  expect(result).toMatchObject({
    kind: "rejected",
    failure: {
      operationId: prepared.operationId,
      exitedSources: [],
      remainingSources: [{ roomId: source.roomId }],
      currentRoomId: source.roomId,
    },
  });
  const lookup = await SELF.fetch(
    `https://api.test/api/rooms/lookup?code=${source.inviteCode}`,
    { headers: { Cookie: await sessionCookieFor(A) } },
  );
  expect(lookup.status).toBe(200);
});
it("source退出後の確定満員は終端となり、同ID・遅延RPCで復活せず別移動を許す", async () => {
  const source = await createRoomAs(A),
    target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  const account = await suspendMove(prepared.operationId, "joining", [
    source.roomId,
  ]);
  const original = env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId));
  expect(
    await original.leaveForParticipation(
      A.sub,
      prepared.operationId,
      prepared.sources[0],
      A.sub,
      "discard",
      1,
    ),
  ).toBe("disbanded");
  const destination = await expireAndFill(target.roomId, prepared.operationId);
  const result = await account.status(A.sub, prepared.operationId);
  expect(result).toMatchObject({
    kind: "rejected",
    reason: "destination_full",
    failure: {
      exitedSources: [{ roomId: source.roomId, result: "disbanded" }],
      remainingSources: [],
    },
  });
  await runInDurableObject(account, async (_account, state) =>
    expect(await state.storage.get("active")).toBeUndefined(),
  );
  expect(await account.status(A.sub, prepared.operationId)).toEqual(result);
  expect(
    await destination.commitParticipation(
      A.sub,
      A.name,
      prepared.operationId,
      1,
    ),
  ).toBe("stale");
  expect(await destination.isMember(A.sub)).toBe(false);
  const next = await createRoomAs(B);
  expect(
    await account.prepare(A.sub, { kind: "join", code: next.inviteCode }, true),
  ).toMatchObject({ kind: "ready", roomId: next.roomId });
  expect(await account.status(A.sub, prepared.operationId)).toEqual(result);
  expect(await account.mayOperate(A.sub, next.roomId)).toBe(true);
  expect(await original.isMember(A.sub)).toBe(false);
});
it("部分退出のreceiptを照合して、予約失効の満員では残りのsourceを退出させず事実を返す", async () => {
  const first = await createRoomAs(A),
    remaining = await createRoomAs(B),
    target = await createRoomAs(C);
  const survivor = env.ROOM_DO.get(env.ROOM_DO.idFromName(remaining.roomId));
  await survivor.upsertMember(A.sub, A.name);
  const prepared = confirmation(await prepare(target.inviteCode));
  const account = await suspendMove(prepared.operationId, "leaving");
  const original = env.ROOM_DO.get(env.ROOM_DO.idFromName(first.roomId));
  const expected = prepared.sources.find((s) => s.roomId === first.roomId);
  if (!expected) throw new Error("sourceなし");
  expect(
    await original.leaveForParticipation(
      A.sub,
      prepared.operationId,
      expected,
      A.sub,
      "discard",
      1,
    ),
  ).toBe("disbanded");
  await expireAndFill(target.roomId, prepared.operationId);
  const result = await account.status(A.sub, prepared.operationId);
  expect(await survivor.isMember(A.sub)).toBe(true);
  expect(await survivor.isJoinable()).toBe(true);
  expect(result).toMatchObject({
    kind: "rejected",
    failure: {
      exitedSources: [{ roomId: first.roomId, result: "disbanded" }],
      remainingSources: [{ roomId: remaining.roomId }],
      currentRoomId: remaining.roomId,
    },
  });
  expect(await account.mayOperate(A.sub, remaining.roomId)).toBe(true);
});
it("sourceへ遅れて届いたRPCも予約期限切れなら退出せず、終端取消fence後の旧RPCも拒否する", async () => {
  const source = await createRoomAs(A),
    target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  const account = await suspendMove(prepared.operationId, "leaving");
  const original = env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId));
  expect(
    await original.leaveForParticipation(
      A.sub,
      prepared.operationId,
      prepared.sources[0],
      A.sub,
      "discard",
      1,
      Date.now() - 1,
    ),
  ).toBe("reservation-expired");
  expect(await original.isMember(A.sub)).toBe(true);
  await expireAndFill(target.roomId, prepared.operationId);
  expect(await account.status(A.sub, prepared.operationId)).toMatchObject({
    kind: "rejected",
  });
  expect(
    await original.leaveForParticipation(
      A.sub,
      prepared.operationId,
      prepared.sources[0],
      A.sub,
      "discard",
      1,
      Date.now() + 120000,
    ),
  ).toBe("changed");
  expect(await original.isMember(A.sub)).toBe(true);
});
it("取消fenceの途中停止は保存済み終端意図から回復し、source退出へ戻らない", async () => {
  const source = await createRoomAs(A),
    target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  const account = await suspendMove(prepared.operationId, "leaving");
  await runInDurableObject(account, async (_account, state) => {
    const key = `op:${prepared.operationId}`;
    const op = await state.storage.get<Record<string, unknown>>(key);
    if (!op) throw new Error("opなし");
    op.terminalFailure = {
      reason: "destination_closed",
      error: "移動先が終了しました。",
    };
    await state.storage.put(key, op);
  });
  await env.ROOM_DO.get(
    env.ROOM_DO.idFromName(target.roomId),
  ).cancelParticipation(A.sub, prepared.operationId, 1);
  expect(await account.status(A.sub, prepared.operationId)).toMatchObject({
    kind: "rejected",
    reason: "destination_closed",
    failure: { exitedSources: [], currentRoomId: source.roomId },
  });
  expect(
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId)).isMember(
      A.sub,
    ),
  ).toBe(true);
  expect(await account.mayOperate(A.sub, source.roomId)).toBe(true);
});
it("参加commitの応答消失後に移動先が完了しても、receiptを結果として取り出し再参加しない", async () => {
  const source = await createRoomAs(A),
    target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  const account = await suspendMove(prepared.operationId, "joining", [
    source.roomId,
  ]);
  expect(
    await env.ROOM_DO.get(
      env.ROOM_DO.idFromName(source.roomId),
    ).leaveForParticipation(
      A.sub,
      prepared.operationId,
      prepared.sources[0],
      A.sub,
      "discard",
      1,
    ),
  ).toBe("disbanded");
  const destination = env.ROOM_DO.get(env.ROOM_DO.idFromName(target.roomId));
  expect(
    await destination.reserveParticipation(A.sub, prepared.operationId, 1),
  ).toBe("ok");
  expect(
    await destination.commitParticipation(
      A.sub,
      A.name,
      prepared.operationId,
      1,
    ),
  ).toBe("ok");
  await runInRoomDO(target.roomId, (_room, state) =>
    state.storage.sql.exec("UPDATE room_state SET outcome_published=1"),
  );
  expect(await account.status(A.sub, prepared.operationId)).toMatchObject({
    kind: "ready",
    roomId: target.roomId,
  });
  expect(await destination.isJoinable()).toBe(false);
});
it("作成publishの応答消失後は受付期限切れでも確定結果を取得し、現在の参加を終了させない", async () => {
  const room = await createRoomAs(A);
  const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(A.sub));
  let operationId = "";
  await runInDurableObject(account, async (_account, state) => {
    const ops = await state.storage.list<Record<string, unknown>>({
      prefix: "op:",
    });
    const entry = [...ops.entries()][0];
    if (!entry) throw new Error("opなし");
    operationId = entry[0].slice(3);
    const op = entry[1];
    delete op.result;
    op.phase = "joining";
    await state.storage.put(entry[0], op);
    await state.storage.put("active", operationId);
  });
  await env.DB.prepare(
    "UPDATE room_creation_policy SET retired_before=? WHERE id=1",
  )
    .bind(Date.now() + 1000)
    .run();
  expect(await account.status(A.sub, operationId)).toMatchObject({
    kind: "ready",
    roomId: room.roomId,
  });
  expect(
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(room.roomId)).isJoinable(),
  ).toBe(true);
});
it("未公開の作成が失効した終端はRoomDOも閉じ、遅延initializeで活動参加を復活させない", async () => {
  const source = await createRoomAs(A),
    issued = issueCreationId();
  const account = env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(A.sub));
  const prepared = confirmation(
    await account.prepare(A.sub, {
      kind: "create",
      input: {
        expectedPrincipal: A.sub,
        requestId: issued.requestId,
        name: "中断した作成",
      },
    }),
  );
  const { reserveRoomCreation, creationIdentity } = await import(
    "../lib/room-creation"
  );
  const creation = await reserveRoomCreation(
    env.DB,
    A.sub,
    issued.requestId,
    "中断した作成",
  );
  await suspendMove(prepared.operationId, "joining", [source.roomId]);
  await runInDurableObject(account, async (_account, state) => {
    const key = `op:${prepared.operationId}`;
    const op = await state.storage.get<Record<string, unknown>>(key);
    if (!op) throw new Error("opなし");
    op.destination = {
      roomId: creation.room_id,
      inviteCode: creation.invite_code,
      hostId: A.sub,
    };
    await state.storage.put(key, op);
  });
  expect(
    await env.ROOM_DO.get(
      env.ROOM_DO.idFromName(source.roomId),
    ).leaveForParticipation(
      A.sub,
      prepared.operationId,
      prepared.sources[0],
      A.sub,
      "discard",
      1,
    ),
  ).toBe("disbanded");
  const destination = env.ROOM_DO.get(env.ROOM_DO.idFromName(creation.room_id));
  expect(
    await destination.initializeCreation(
      creationIdentity(creation),
      A.name,
      creation.name,
    ),
  ).toBe("ready");
  await env.DB.prepare(
    "UPDATE room_creation_policy SET retired_before=? WHERE id=1",
  )
    .bind(Date.now() + 1000)
    .run();
  expect(await account.status(A.sub, prepared.operationId)).toMatchObject({
    kind: "rejected",
    reason: "expired",
  });
  expect(await destination.isMember(A.sub)).toBe(false);
  expect(
    await destination.initializeCreation(
      creationIdentity(creation),
      A.name,
      creation.name,
    ),
  ).toBe("closed");
});
it("候補切断の再確認後も古い決定の重複再送を新たな解散同意として扱わない", async () => {
  const source = await createRoomAs(A);
  await joinRoomAs(B, source.inviteCode);
  const socket = await connectRoomAs(B, source.roomId);
  await socket.next();
  const target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  expect(prepared.sources[0].action).toBe("transfer");
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId)).leave(B.sub);
  socket.close();
  const changed = confirmation(await commit(prepared.operationId));
  expect(changed.version).toBe(1);
  expect(await commit(prepared.operationId)).toMatchObject({
    kind: "confirmation",
    reason: "state_changed",
  });
  expect(
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId)).isMember(
      A.sub,
    ),
  ).toBe(true);
  expect(
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId)).isJoinable(),
  ).toBe(true);
  expect(
    await commit(prepared.operationId, "discard", changed.version ?? 0),
  ).toMatchObject({ kind: "ready", roomId: target.roomId });
});

it("公開commitは確認version欠落を現在versionで補わず拒否する", async () => {
  const source = await createRoomAs(A),
    target = await createRoomAs(C);
  const prepared = confirmation(await prepare(target.inviteCode));
  const response = await SELF.fetch(
    "https://api.test/api/room-participation/commit",
    {
      method: "POST",
      headers: {
        Cookie: await sessionCookieFor(A),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationId: prepared.operationId,
        expectedPrincipal: A.sub,
        outcomeAccess: "discard",
      }),
    },
  );
  expect(response.status).toBe(400);
  expect(
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(source.roomId)).isMember(
      A.sub,
    ),
  ).toBe(true);
});
