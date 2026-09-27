import { env, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";
import { RoomBroadcaster } from "./broadcast";
import { sharingHandlers } from "./sharing";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "進行役",
  email: "host@example.test",
};
const guest = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "参加者",
  email: "guest@example.test",
};
const roomIdBySocket = new WeakMap<RoomSocket, string>();
async function until(
  socket: RoomSocket,
  type: string,
): Promise<Record<string, unknown>> {
  for (;;) {
    const message = await socket.next();
    if (message.type === "phase:save-requested") {
      const roomId = roomIdBySocket.get(socket);
      if (roomId)
        await runInRoomDO(roomId, async (instance, state) => {
          state.storage.sql.exec(
            "UPDATE pending_phase_transition SET deadline_at = ?1 WHERE id = 1",
            Date.now() - 1,
          );
          await instance.alarm();
        });
      continue;
    }
    if (message.type === type) return message;
  }
}
async function setup() {
  const { roomId, inviteCode } = await createRoomAs(host);
  await joinRoomAs(guest, inviteCode);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  await stub.setPhase({ kind: "step", phase: 1, step: 1 }, host.sub);
  const owner = await connectRoomAs(host, roomId);
  await owner.next();
  const member = await connectRoomAs(guest, roomId);
  await member.next();
  roomIdBySocket.set(owner, roomId);
  roomIdBySocket.set(member, roomId);
  return { roomId, inviteCode, owner, member, stub };
}
describe("一人ずつの共有", () => {
  it("非ホストの進行を拒否する", async () => {
    const { owner, member } = await setup();
    member.ws.send(
      JSON.stringify({
        type: "sharing:start",
        revision: crypto.randomUUID(),
        durationMs: 180000,
      }),
    );
    expect(await member.next()).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    owner.close();
    member.close();
  });
  it("共有へ入ると進行役を先頭に順番を共有し、まだ計時しない", async () => {
    const { owner, member, roomId } = await setup();
    owner.ws.send(
      JSON.stringify({
        type: "phase:next",
        ...(await currentPhaseExpectation(roomId)),
      }),
    );
    await until(owner, "phase:updated");
    const reconnect = await connectRoomAs(host, roomId);
    expect(await reconnect.next()).toMatchObject({
      type: "snapshot",
      timer: { status: "idle" },
      sharing: {
        status: "ready",
        order: [{ userId: host.sub }, { userId: guest.sub }],
        results: [],
        currentIndex: null,
        startsAt: null,
      },
    });
    owner.close();
    member.close();
    reconnect.close();
  });
});

// 状態はWSの観測値を使い、時刻境界だけをテスト用DO内部から進める。
async function sharingMessage(socket: RoomSocket) {
  for (;;) {
    const message = await socket.next();
    if (message.type === "sharing:updated") return message;
  }
}
async function enterSharing(owner: RoomSocket, roomId: string) {
  owner.ws.send(
    JSON.stringify({
      type: "phase:next",
      ...(await currentPhaseExpectation(roomId)),
    }),
  );
  await until(owner, "phase:updated");
  const connection = await connectRoomAs(host, roomId);
  const snapshot = await connection.next();
  connection.close();
  if (snapshot.type !== "snapshot" || !snapshot.sharing)
    throw new Error("共有状態がない");
  return snapshot.sharing;
}
async function makeTurnDue(roomId: string) {
  await runInRoomDO(roomId, async (instance, state) => {
    state.storage.sql.exec(
      "UPDATE sharing_state SET state_json = json_set(state_json, '$.startsAt', ?1) WHERE id = 1",
      Date.now() - 1,
    );
    await instance.alarm();
  });
}
async function currentSnapshot(roomId: string) {
  const connection = await connectRoomAs(host, roomId);
  const snapshot = await connection.next();
  connection.close();
  if (snapshot.type !== "snapshot" || !snapshot.sharing)
    throw new Error("共有状態がない");
  return { ...snapshot, sharing: snapshot.sharing };
}

describe("共有の遷移と同期", () => {
  it("開始で即座に発表者を揃え、2秒間計時せず、その後同じ持ち時間で開始する", async () => {
    const { owner, member, roomId, stub } = await setup();
    const ready = await enterSharing(owner, roomId);
    const before = Date.now();
    owner.ws.send(
      JSON.stringify({
        type: "sharing:start",
        revision: ready.revision,
        durationMs: 180000,
      }),
    );
    const pending = await sharingMessage(owner);
    expect(pending.sharing).toMatchObject({
      status: "active",
      currentIndex: 0,
      durationMs: 180000,
    });
    expect(pending.sharing.startsAt).toBeGreaterThanOrEqual(before + 2000);
    expect(pending.timer).toEqual({ status: "idle" });
    expect(await sharingMessage(member)).toEqual(pending);
    await runInRoomDO(roomId, (instance) => instance.alarm());
    expect(await stub.getTimerState()).toEqual({ status: "idle" });
    expect((await currentSnapshot(roomId)).sharing).toEqual(pending.sharing);
    // 実時刻でも2秒の境界を通す（アラームが自動実行されないpoolにも対応）。
    await new Promise((resolve) => setTimeout(resolve, 2050));
    await runInRoomDO(roomId, (instance) => instance.alarm());
    const running = await sharingMessage(owner);
    expect(running.timer).toMatchObject({
      status: "running",
      durationMs: 180000,
    });
    if (running.timer.status !== "running")
      throw new Error("計時が開始していない");
    expect(running.timer.endsAt - running.serverNow).toBeGreaterThan(179900);
    expect(running.sharing.startsAt).toBeNull();
    expect(await sharingMessage(member)).toEqual(running);
    owner.close();
    member.close();
  });

  it.each([
    "running",
    "paused",
    "ended",
  ] as const)("%sからの交代は延長を持ち越さず、再送・連打を一度に畳む", async (timerStatus) => {
    const { owner, member, roomId } = await setup();
    const ready = await enterSharing(owner, roomId);
    owner.ws.send(
      JSON.stringify({
        type: "sharing:start",
        revision: ready.revision,
        durationMs: 30000,
      }),
    );
    const pending = await sharingMessage(owner);
    // 待機中は新しい版を送っても進まない。タイマー操作も拒否する。
    owner.ws.send(
      JSON.stringify({
        type: "sharing:advance",
        revision: pending.sharing.revision,
        outcome: "done",
      }),
    );
    expect((await sharingMessage(owner)).sharing).toEqual(pending.sharing);
    owner.ws.send(JSON.stringify({ type: "timer:start", durationMs: 1000 }));
    expect(await owner.next()).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    await makeTurnDue(roomId);
    let state = (await sharingMessage(owner)).sharing;
    owner.ws.send(JSON.stringify({ type: "timer:extend" }));
    expect(await until(owner, "timer:updated")).toMatchObject({
      timer: { durationMs: 90000 },
    });
    if (timerStatus === "paused") {
      owner.ws.send(JSON.stringify({ type: "timer:pause" }));
      await until(owner, "timer:updated");
    } else if (timerStatus === "ended") {
      await runInRoomDO(roomId, async (instance, context) => {
        context.storage.sql.exec(
          "UPDATE timer_state SET ends_at = ?1 WHERE id = 1",
          Date.now() - 1,
        );
        await instance.alarm();
      });
      expect(await until(owner, "timer:updated")).toMatchObject({
        timer: { status: "ended" },
      });
      expect((await currentSnapshot(roomId)).sharing.currentIndex).toBe(0);
    }
    const advance = {
      type: "sharing:advance",
      revision: state.revision,
      outcome: "passed",
    };
    owner.ws.send(JSON.stringify(advance));
    owner.ws.send(JSON.stringify(advance));
    state = (await sharingMessage(owner)).sharing;
    expect(state).toMatchObject({
      currentIndex: 1,
      results: ["passed"],
      durationMs: 30000,
    });
    expect((await sharingMessage(owner)).sharing).toEqual(state);
    await makeTurnDue(roomId);
    const second = await sharingMessage(owner);
    expect(second.timer).toMatchObject({
      status: "running",
      durationMs: 30000,
    });
    // 2秒経過後に古い操作が再送されても二人先へ進まない。
    owner.ws.send(JSON.stringify(advance));
    expect((await sharingMessage(owner)).sharing.currentIndex).toBe(1);
    owner.ws.send(
      JSON.stringify({
        type: "sharing:advance",
        revision: state.revision,
        outcome: "done",
      }),
    );
    const completed = await sharingMessage(owner);
    expect(completed.sharing).toMatchObject({
      status: "complete",
      currentIndex: null,
      startsAt: null,
      results: ["passed", "done"],
    });
    expect(completed.timer).toEqual({ status: "idle" });
    expect((await currentSnapshot(roomId)).phase).toEqual({
      kind: "step",
      phase: 1,
      step: 2,
    });
    expect(
      await runInRoomDO(roomId, (_, context) => context.storage.getAlarm()),
    ).toBeNull();
    owner.close();
    member.close();
  });

  it("途中参加は末尾へ一度追加し、再接続と3フェーズの共有で順番を維持する", async () => {
    const { owner, member, roomId, inviteCode, stub } = await setup();
    const ready = await enterSharing(owner, roomId);
    const late = {
      sub: "33333333-3333-4333-8333-333333333333",
      name: "途中参加",
      email: "late@example.test",
    };
    await joinRoomAs(late, inviteCode);
    await joinRoomAs(late, inviteCode);
    const joined = (await sharingMessage(owner)).sharing;
    expect(joined.order.map(({ userId }) => userId)).toEqual([
      ...ready.order.map(({ userId }) => userId),
      late.sub,
    ]);
    owner.ws.send(
      JSON.stringify({
        type: "sharing:start",
        revision: joined.revision,
        durationMs: 30000,
      }),
    );
    const pending = await sharingMessage(owner);
    const returned = await connectRoomAs(guest, roomId);
    expect(await returned.next()).toMatchObject({
      sharing: pending.sharing,
      timer: pending.timer,
    });
    returned.close();
    for (const phase of [2, 3] as const) {
      await stub.setPhase({ kind: "step", phase, step: 1 }, host.sub);
      const reset = await enterSharing(owner, roomId);
      expect(reset.order).toEqual(joined.order);
      expect(reset).toMatchObject({
        status: "ready",
        results: [],
        currentIndex: null,
        startsAt: null,
      });
      expect((await currentSnapshot(roomId)).timer).toEqual({ status: "idle" });
    }
    owner.close();
    member.close();
  });

  it("非ホストは有効な版でも開始・交代できず、非メンバーは接続できない", async () => {
    const { owner, member, roomId } = await setup();
    const ready = await enterSharing(owner, roomId);
    for (const message of [
      { type: "sharing:start", durationMs: 30000 },
      { type: "sharing:advance", outcome: "passed" },
    ]) {
      member.ws.send(JSON.stringify({ ...message, revision: ready.revision }));
      expect(await until(member, "error")).toMatchObject({ code: "forbidden" });
    }
    expect((await currentSnapshot(roomId)).sharing).toEqual(ready);
    const outsider = {
      sub: "44444444-4444-4444-8444-444444444444",
      name: "外部",
      email: "outside@example.test",
    };
    const response = await SELF.fetch(
      `https://api.test/api/rooms/${roomId}/ws`,
      {
        headers: {
          Upgrade: "websocket",
          Cookie: await sessionCookieFor(outsider),
        },
      },
    );
    expect(response.status).toBe(404);
    owner.close();
    member.close();
  });
});

it("計時予約の保存に失敗したら発表者もタイマーも変更しない", async () => {
  const { owner, member, roomId } = await setup();
  const ready = await enterSharing(owner, roomId);
  await runInRoomDO(roomId, async (_, state) => {
    const storage = new Proxy(state.storage, {
      get(target, key) {
        if (key === "setAlarm")
          return () => Promise.reject(new Error("予約失敗"));
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      sharingHandlers["sharing:start"](
        {
          sql: state.storage.sql,
          storage,
          userId: host.sub,
          ws: new WebSocketPair()[1],
          broadcaster: new RoomBroadcaster(state),
          reply: vi.fn(),
          refreshSnapshots: vi.fn(),
        },
        { type: "sharing:start", revision: ready.revision, durationMs: 30000 },
      ),
    ).rejects.toThrow("予約失敗");
  });
  expect((await currentSnapshot(roomId)).sharing).toEqual(ready);
  owner.close();
  member.close();
});

it("更新前から共有ステップにいるルームも接続時に順番を復元できる", async () => {
  const { owner, member, roomId, stub } = await setup();
  await stub.setPhase({ kind: "step", phase: 1, step: 2 }, host.sub);
  const snapshot = await currentSnapshot(roomId);
  expect(snapshot.sharing).toMatchObject({
    status: "ready",
    order: [{ userId: host.sub }, { userId: guest.sub }],
  });
  expect(snapshot.timer).toEqual({ status: "idle" });
  owner.close();
  member.close();
});

it("発表者以外も自分の付箋を共有でき、交代では他者の下書きを公開しない", async () => {
  const { owner, member, roomId } = await setup();
  owner.ws.send(
    JSON.stringify({ type: "note:create", content: "進行役だけの下書き" }),
  );
  await until(owner, "note:inserted");
  member.ws.send(
    JSON.stringify({ type: "note:create", content: "参加者の説明" }),
  );
  const inserted = await until(member, "note:inserted");
  const noteId = (inserted.note as { id: string }).id;
  const ready = await enterSharing(owner, roomId);
  owner.ws.send(
    JSON.stringify({
      type: "sharing:start",
      revision: ready.revision,
      durationMs: 30000,
    }),
  );
  await sharingMessage(owner);
  member.ws.send(
    JSON.stringify({ type: "note:publish", noteId, x: 100, y: 100 }),
  );
  expect(await until(member, "note:inserted")).toMatchObject({
    note: { id: noteId, visibility: "shared" },
  });
  const reconnect = await connectRoomAs(guest, roomId);
  const snapshot = await reconnect.next();
  expect(snapshot).toMatchObject({
    notes: [expect.objectContaining({ id: noteId, visibility: "shared" })],
  });
  expect(JSON.stringify(snapshot)).not.toContain("進行役だけの下書き");
  expect((await currentSnapshot(roomId)).notes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        content: "進行役だけの下書き",
        visibility: "private",
      }),
    ]),
  );
  reconnect.close();
  owner.close();
  member.close();
});

// 共有の2秒待機と反復操作を組み合わせても、前の周回を再開しない。
it.each([
  1, 2, 3,
] as const)("フェーズ%iで追加執筆へ戻ると計時予約を解除し同じ順番で共有をやり直せる", async (phase) => {
  const { owner, member, roomId, stub } = await setup();
  await stub.setPhase({ kind: "step", phase, step: 1 }, host.sub);
  const ready = await enterSharing(owner, roomId);
  owner.ws.send(
    JSON.stringify({
      type: "sharing:start",
      revision: ready.revision,
      durationMs: 30000,
    }),
  );
  const pending = await sharingMessage(owner);
  expect(pending.sharing.startsAt).not.toBeNull();
  expect(pending.timer).toEqual({ status: "idle" });
  owner.ws.send(
    JSON.stringify({
      type: "phase:restart-writing",
      ...(await currentPhaseExpectation(roomId)),
    }),
  );
  await until(owner, "phase:updated");
  expect(
    await runInRoomDO(roomId, (_, state) => state.storage.getAlarm()),
  ).toBeNull();
  const writing = await currentSnapshot(roomId);
  expect(writing).toMatchObject({
    phase: { kind: "step", phase, step: 1 },
    timer: { status: "idle" },
    sharing: {
      status: "inactive",
      currentIndex: null,
      results: [],
      startsAt: null,
    },
  });
  // 既にキューに載った古いアラームも個人作業の計時を始めない。
  await runInRoomDO(roomId, (instance) => instance.alarm());
  expect(await stub.getTimerState()).toEqual({ status: "idle" });
  const again = await enterSharing(owner, roomId);
  expect(again).toMatchObject({
    status: "ready",
    currentIndex: null,
    results: [],
    startsAt: null,
    order: ready.order,
    durationMs: 30000,
  });
  expect(again.revision).not.toBe(ready.revision);
  owner.ws.send(
    JSON.stringify({
      type: "sharing:start",
      revision: ready.revision,
      durationMs: 30000,
    }),
  );
  expect((await sharingMessage(owner)).sharing).toEqual(again);
  owner.close();
  member.close();
});
