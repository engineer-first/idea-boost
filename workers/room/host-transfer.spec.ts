import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { HOST_ID_HEADER, USER_ID_HEADER } from "./room-do";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
function next(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    ws.addEventListener("message", (e) => resolve(JSON.parse(String(e.data))), {
      once: true,
    }),
  );
}
async function setup() {
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(crypto.randomUUID()));
  await stub.initializeNewRoom(A, "作成者");
  await stub.upsertMember(B, "次のホスト");
  await stub.upsertMember(C, "一般参加者");
  async function connect(user: string) {
    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: user,
        [HOST_ID_HEADER]: A,
      },
    });
    const ws = res.webSocket;
    if (!ws) throw new Error("接続できません");
    ws.accept();
    const snapshot = await next(ws);
    return { ws, snapshot };
  }
  const a = await connect(A);
  const b = await connect(B);
  return { stub, connect, a: a.ws, b: b.ws };
}
function transfer(ws: WebSocket, targetUserId = B, expectedHostRevision = 0) {
  const response = next(ws);
  ws.send(
    JSON.stringify({
      type: "host:transfer",
      targetUserId,
      expectedHostRevision,
    }),
  );
  return response;
}

describe("開始前ホスト移譲", () => {
  it("非ホストは自己昇格できない", async () => {
    const { a, b } = await setup();
    expect(await transfer(b)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    a.close();
    b.close();
  });
  it.each([A, C])("自分自身/未接続の対象 %s は拒否する", async (target) => {
    const { a, b } = await setup();
    expect(await transfer(a, target)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    a.close();
    b.close();
  });
  it("全員へ現在ホストを配信し旧ホストの開始を拒否する", async () => {
    const { a, b, stub, connect } = await setup();
    const other = next(b);
    expect(await transfer(a)).toMatchObject({
      type: "host:updated",
      hostUserId: B,
      hostRevision: 1,
    });
    expect(await other).toMatchObject({
      type: "host:updated",
      hostUserId: B,
      hostRevision: 1,
    });
    const denied = next(a);
    a.send(JSON.stringify({ type: "start_phase", expectedHostRevision: 0 }));
    expect(await denied).toMatchObject({ type: "error", code: "forbidden" });
    const again = await connect(A);
    expect(again.snapshot).toMatchObject({
      hostUserId: B,
      hostRevision: 1,
      isHost: false,
    });
    const started = next(b);
    b.send(JSON.stringify({ type: "start_phase", expectedHostRevision: 1 }));
    expect(await started).toMatchObject({ type: "phase:updated" });
    expect(await stub.getPhase()).toMatchObject({ kind: "step" });
    a.close();
    b.close();
    again.ws.close();
  });
  it("二重送信と移譲して戻った後の古い要求を再適用しない", async () => {
    const { a, b } = await setup();
    const bUpdate = next(b);
    await transfer(a);
    await bUpdate;
    expect(await transfer(a)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    const aUpdate = next(a);
    await transfer(b, A, 1);
    await aUpdate;
    expect(await transfer(a, B, 0)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    const staleStart = next(a);
    a.send(JSON.stringify({ type: "start_phase", expectedHostRevision: 0 }));
    expect(await staleStart).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    a.close();
    b.close();
  });
  it("開始が先なら移譲を拒否する", async () => {
    const { a, b } = await setup();
    const start = next(a);
    a.send(JSON.stringify({ type: "start_phase" }));
    await start;
    expect(await transfer(a)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    a.close();
    b.close();
  });
  it("対象の退出が先なら移譲を拒否する", async () => {
    const { a, b, stub } = await setup();
    const left = next(a);
    await stub.leave(B);
    await left;
    expect(await transfer(a)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    a.close();
    b.close();
  });
});

describe("移譲の退出・切断境界", () => {
  it("接続が閉じた相手には移譲しない", async () => {
    const { a, b, stub } = await setup();
    b.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await transfer(a)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(await stub.getCurrentHost(A)).toMatchObject({
      hostUserId: A,
      hostRevision: 0,
    });
    a.close();
  });
  it("移譲後の古い曖昧な退出では解散せず、明示本人退出では現在ホストを守る", async () => {
    const { a, b, stub } = await setup();
    const update = next(b);
    await transfer(a);
    await update;
    expect(await stub.leaveOrDisband(B, A)).toBe("forbidden");
    expect(await stub.leaveOrDisband(B, A, "self", 0)).toBe("forbidden");
    expect(await stub.leaveOrDisband(B, A, "self", 1)).toBe("forbidden");
    expect(await stub.leaveOrDisband(A, A, "disband", 0)).toBe("forbidden");
    expect(await stub.leaveOrDisband(C, A, "disband", 1)).toBe("forbidden");
    expect(await stub.leaveOrDisband(A, A, "self", 1)).toBe("left");
    expect(await stub.getCurrentHost(A)).toMatchObject({
      hostUserId: B,
      hostRevision: 1,
    });
    b.close();
  });
  it("移譲後の新ホスト切断と再接続でも旧シードへ戻らない", async () => {
    const { a, b, stub, connect } = await setup();
    const update = next(b);
    await transfer(a);
    await update;
    b.close();
    const reconnected = await connect(B);
    expect(reconnected.snapshot).toMatchObject({
      hostUserId: B,
      hostRevision: 1,
      isHost: true,
    });
    expect(await stub.getCurrentHost(A)).toMatchObject({
      hostUserId: B,
      hostRevision: 1,
    });
    a.close();
    reconnected.ws.close();
  });
});
