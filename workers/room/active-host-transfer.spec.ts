import { env, runDurableObjectAlarm, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_STEP_COUNTS, type RoomPhase } from "../../contracts/phase";
import type { ServerMessage } from "../../contracts/room-protocol";
import {
  arrangeSharingPresenter,
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
} from "../test-helpers";
import {
  getSharingState,
  resetSharingForPhase,
  saveSharingState,
} from "./sharing-state";
import { saveTimerState } from "./timer";

const A = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "a@test.example",
  name: "Ken Mori",
};
const B = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "b@test.example",
  name: "Hana Sato",
};
const C = {
  sub: "33333333-3333-4333-8333-333333333333",
  email: "c@test.example",
  name: "Yui Ito",
};
const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
  vi.restoreAllMocks();
});
async function connect(user: typeof A, roomId: string) {
  const socket = await connectRoomAs(user, roomId);
  sockets.push(socket);
  const snapshot = await receive(socket, "snapshot");
  return { socket, snapshot };
}
async function setup() {
  const { roomId, inviteCode } = await createRoomAs(A);
  await joinRoomAs(B, inviteCode);
  await joinRoomAs(C, inviteCode);
  const { socket: a } = await connect(A, roomId);
  const { socket: b } = await connect(B, roomId);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  return { roomId, stub, a, b };
}
function send(socket: RoomSocket, message: unknown) {
  socket.ws.send(JSON.stringify(message));
}
async function receive<T extends ServerMessage["type"]>(
  socket: RoomSocket,
  type: T,
): Promise<Extract<ServerMessage, { type: T }>> {
  const message = await socket.next();
  expect(message.type).toBe(type);
  return message as Extract<ServerMessage, { type: T }>;
}
async function transfer(
  from: RoomSocket,
  to: RoomSocket,
  targetUserId: string,
  expectedHostRevision: number,
) {
  send(from, { type: "host:transfer", targetUserId, expectedHostRevision });
  expect(await receive(from, "host:updated")).toMatchObject({
    hostUserId: targetUserId,
    hostRevision: expectedHostRevision + 1,
  });
  await receive(to, "host:updated");
}
const activePhases: RoomPhase[] = Object.entries(PHASE_STEP_COUNTS).flatMap(
  ([phase, count]) =>
    Array.from({ length: count }, (_, index) => ({
      kind: "step" as const,
      phase: Number(phase) as 1 | 2 | 3,
      step: index + 1,
    })),
);

async function readProgress(roomId: string) {
  return runInRoomDO(roomId, (_room, state) => {
    const tables = [
      "room_state",
      "timer_state",
      "sharing_state",
      "notes",
      "note_votes",
      "note_vote_stickers",
      "groups",
      "decisions",
      "progress_history",
    ];
    return Object.fromEntries(
      tables.map((table) => [
        table,
        state.storage.sql.exec(`SELECT * FROM ${table}`).toArray(),
      ]),
    );
  });
}

describe("進行中のホスト移譲（Workerと複数WebSocket）", () => {
  it.each(
    activePhases,
  )("全ての進行中ステップ $phase-$step で状態を維持して移譲する", async (phase) => {
    const { roomId, stub, a, b } = await setup();
    await stub.setPhase(phase, A.sub);
    const before = await readProgress(roomId);
    await transfer(a, b, B.sub, 0);
    expect(await readProgress(roomId)).toEqual(before);
    expect((await connect(B, roomId)).snapshot).toMatchObject({
      phase,
      hostUserId: B.sub,
      hostRevision: 1,
      isHost: true,
    });
    const creator = await env.DB.prepare("SELECT host_id FROM rooms WHERE id=?")
      .bind(roomId)
      .first<{ host_id: string }>();
    expect(creator?.host_id).toBe(A.sub);
  });

  it("他人の非公開付箋は新ホストにも配信せず、進行中タイマーも変更しない", async () => {
    const { roomId, stub, a, b } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
    send(a, { type: "note:create", content: "作成者だけの下書き" });
    const privateA = await receive(a, "note:inserted");
    send(b, { type: "note:create", content: "参加者だけの下書き" });
    const privateB = await receive(b, "note:inserted");
    send(a, { type: "timer:start", durationMs: 60_000 });
    await receive(a, "timer:updated");
    await receive(b, "timer:updated");
    const before = await readProgress(roomId);
    await transfer(a, b, B.sub, 0);
    expect(await readProgress(roomId)).toEqual(before);
    const newHost = (await connect(B, roomId)).snapshot;
    const oldHost = (await connect(A, roomId)).snapshot;
    expect(newHost.notes.map((note) => note.id)).toEqual([privateB.note.id]);
    expect(oldHost.notes.map((note) => note.id)).toEqual([privateA.note.id]);
    expect(newHost.timer).toEqual(oldHost.timer);
    // 旧ホストも通常参加者として本文を書ける。個人操作に世代条件を足さない。
    send(a, { type: "note:create", content: "交代後も自分の下書き" });
    expect(await receive(a, "note:inserted")).toMatchObject({
      note: {
        authorId: A.sub,
        content: "交代後も自分の下書き",
        visibility: "private",
      },
    });
  });

  it("移譲応答と拒否応答に操作IDを返し、並行操作の結果と区別する", async () => {
    const { a, b } = await setup();
    const operationId = crypto.randomUUID();
    send(b, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
      operationId,
    });
    expect(await receive(b, "error")).toMatchObject({
      code: "forbidden",
      operationId,
    });
    send(a, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
      operationId,
    });
    expect(await receive(a, "host:updated")).toMatchObject({
      operationId,
      hostRevision: 1,
    });
    expect(await receive(b, "host:updated")).toMatchObject({
      operationId,
      hostRevision: 1,
    });
  });

  it("A→B→A後に古いタイマー操作を適用せず、最新世代の要求だけ受理する", async () => {
    const { stub, a, b } = await setup();
    await transfer(a, b, B.sub, 0);
    await transfer(b, a, A.sub, 1);
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
    for (const expectedHostRevision of [undefined, 0, 1]) {
      send(a, {
        type: "timer:start",
        durationMs: 60_000,
        expectedHostRevision,
      });
      expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
      expect(await stub.getTimerState()).toEqual({ status: "idle" });
    }
    send(a, {
      type: "timer:start",
      durationMs: 60_000,
      expectedHostRevision: 2,
    });
    await receive(a, "timer:updated");
    await receive(b, "timer:updated");
    expect(await stub.getTimerState()).toMatchObject({ status: "running" });
  });

  it("保存待ちの移譲は拒否して予約を維持し、進行完了後の再試行を受理する", async () => {
    const { roomId, stub, a, b } = await setup();
    const phase = { kind: "step", phase: 1, step: 1 } as const;
    await stub.setPhase(phase, A.sub);
    send(a, {
      type: "phase:next",
      ...(await currentPhaseExpectation(roomId)),
      expectedHostRevision: 0,
    });
    const pending = await receive(a, "phase:save-requested");
    await receive(b, "phase:save-requested");
    const before = await readProgress(roomId);
    send(a, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
    });
    expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
    expect(await readProgress(roomId)).toEqual(before);
    expect(await stub.getCurrentHost()).toMatchObject({
      hostUserId: A.sub,
      hostRevision: 0,
    });
    vi.spyOn(Date, "now").mockReturnValue(pending.deadlineAt + 1);
    await runDurableObjectAlarm(stub);
    expect(await stub.getPhase()).toEqual({ kind: "step", phase: 1, step: 2 });
    for (const socket of [a, b]) {
      await receive(socket, "snapshot");
      await receive(socket, "phase:updated");
    }
    await transfer(a, b, B.sub, 0);
    await transfer(b, a, A.sub, 1);
    expect(
      await runInRoomDO(roomId, (_room, state) =>
        state.storage.sql
          .exec("SELECT * FROM pending_phase_transition")
          .toArray(),
      ),
    ).toEqual([]);
  });

  it("完了済み・旧公開済みルームのホストを変更しない", async () => {
    const { roomId, stub, a } = await setup();
    await stub.setPhase({ kind: "step", phase: 3, step: 5 }, A.sub);
    await runInRoomDO(roomId, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE room_state SET outcome_published=1 WHERE id=1",
      ),
    );
    send(a, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
    });
    expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
    expect(await stub.getCurrentHost()).toEqual({
      hostUserId: A.sub,
      hostRevision: 0,
    });
  });

  it("移譲後RESTの解散では最新世代のみ受理し、作成者の退出で解散しない", async () => {
    const { roomId, stub, a, b } = await setup();
    await stub.setPhase({ kind: "step", phase: 2, step: 3 }, A.sub);
    await transfer(a, b, B.sub, 0);
    async function leave(user: typeof A, body: object) {
      return SELF.fetch(`https://api.test/api/rooms/${roomId}/leave`, {
        method: "POST",
        headers: {
          Cookie: await sessionCookieFor(user),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }
    expect(
      (await leave(A, { intent: "disband", expectedHostRevision: 0 })).status,
    ).toBe(409);
    expect(
      (await leave(B, { intent: "disband", expectedHostRevision: 0 })).status,
    ).toBe(409);
    expect(
      (await leave(A, { intent: "self", expectedHostRevision: 1 })).status,
    ).toBe(204);
    expect(await stub.getCurrentHost()).toEqual({
      hostUserId: B.sub,
      hostRevision: 1,
    });
    expect(
      (await leave(B, { intent: "disband", expectedHostRevision: 1 })).status,
    ).toBe(204);
  });
  it("発表中に移譲しても順番・タイマーを維持し、旧ホスト本人は自分の発表を完了できる", async () => {
    const { roomId, stub, a, b } = await setup();
    const phase = { kind: "step", phase: 1, step: 2 } as const;
    await stub.setPhase(phase, A.sub);
    const sharing = await runInRoomDO(roomId, (_room, storage) => {
      resetSharingForPhase(storage.storage.sql, phase, true);
      const state = getSharingState(storage.storage.sql);
      if (!state) throw new Error("sharing missing");
      state.startsAt = null;
      saveSharingState(storage.storage.sql, state);
      saveTimerState(storage.storage.sql, {
        status: "running",
        durationMs: 60_000,
        endsAt: Date.now() + 60_000,
      });
      return state;
    });
    expect(sharing.order[0].userId).toBe(A.sub);
    const before = await readProgress(roomId);
    await transfer(a, b, B.sub, 0);
    expect(await readProgress(roomId)).toEqual(before);
    send(a, {
      type: "sharing:advance",
      revision: sharing.revision,
      outcome: "passed",
      expectedHostRevision: 0,
    });
    expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
    send(a, {
      type: "sharing:advance",
      revision: sharing.revision,
      outcome: "done",
      expectedHostRevision: 0,
    });
    expect(await receive(a, "sharing:updated")).toMatchObject({
      sharing: { currentIndex: 1, results: ["done"] },
    });
    await receive(b, "sharing:updated");
  });

  it("移譲した新ホストが作った保存待ち進行は正しい世代のまま実行される", async () => {
    const { roomId, stub, a, b } = await setup();
    await stub.setPhase({ kind: "step", phase: 2, step: 1 }, A.sub);
    await transfer(a, b, B.sub, 0);
    send(b, {
      type: "phase:next",
      ...(await currentPhaseExpectation(roomId)),
      expectedHostRevision: 1,
    });
    const pending = await receive(b, "phase:save-requested");
    await receive(a, "phase:save-requested");
    vi.spyOn(Date, "now").mockReturnValue(pending.deadlineAt + 1);
    await runDurableObjectAlarm(stub);
    expect(await stub.getPhase()).toEqual({ kind: "step", phase: 2, step: 2 });
  });

  it("別ルーム接続者・未接続・退出済み・自己昇格を進行中も拒否する", async () => {
    const { roomId, stub, a, b } = await setup();
    await stub.setPhase({ kind: "step", phase: 3, step: 3 }, A.sub);
    const outsider = {
      sub: "66666666-6666-4666-8666-666666666666",
      email: "d@test.example",
      name: "Nao Aoki",
    };
    const otherRoom = await createRoomAs(outsider);
    await connect(outsider, otherRoom.roomId);
    for (const targetUserId of [A.sub, C.sub, outsider.sub]) {
      send(a, { type: "host:transfer", targetUserId, expectedHostRevision: 0 });
      expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
    }
    send(b, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
    });
    expect(await receive(b, "error")).toMatchObject({ code: "forbidden" });
    await stub.leave(B.sub);
    await receive(a, "member_left");
    send(a, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
    });
    expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
    expect(await stub.getCurrentHost()).toEqual({
      hostUserId: A.sub,
      hostRevision: 0,
    });
    expect((await connect(A, roomId)).snapshot.hostRevision).toBe(0);
  });

  it("対象の全接続が閉じたら拒否し、再接続後は同じ世代で再試行できる", async () => {
    const { roomId, stub, a, b } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 4 }, A.sub);
    b.close();
    // closeがDOに届いたことを確認する既存の切断境界と同じ待機。
    await new Promise((resolve) => setTimeout(resolve, 30));
    send(a, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
    });
    expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
    const reconnected = (await connect(B, roomId)).socket;
    await transfer(a, reconnected, B.sub, 0);
    reconnected.close();
    const current = await connect(B, roomId);
    expect(current.snapshot).toMatchObject({
      hostUserId: B.sub,
      hostRevision: 1,
      isHost: true,
    });
  });
  it("実際の投票・グループ・進行履歴を移譲で維持し、旧ホストの一般投票も許可する", async () => {
    const { roomId, stub, a, b } = await setup();
    send(a, { type: "start_phase" });
    await receive(a, "phase:updated");
    await receive(b, "phase:updated");
    const noteIds: string[] = [];
    for (const content of ["共有の候補", "関連する候補"]) {
      send(a, { type: "note:create", content });
      noteIds.push((await receive(a, "note:inserted")).note.id);
    }
    await stub.setPhase({ kind: "step", phase: 1, step: 2 }, A.sub);
    await arrangeSharingPresenter(roomId, A.sub);
    for (const noteId of noteIds) {
      send(a, { type: "note:publish", noteId, x: 30, y: 40 });
      await receive(a, "note:inserted");
      await receive(b, "note:inserted");
    }
    await stub.setPhase({ kind: "step", phase: 1, step: 3 }, A.sub);
    send(a, {
      type: "group:create",
      group: {
        id: crypto.randomUUID(),
        name: "議論グループ",
        noteIds,
        createdAt: "2026-10-03",
        updatedAt: "2026-10-03",
      },
    });
    await receive(a, "group:updated");
    await receive(b, "group:updated");
    await stub.setPhase({ kind: "step", phase: 1, step: 4 }, A.sub);
    send(a, { type: "note:vote", noteId: noteIds[0], kind: "subjective" });
    // 投票中の票は本人だけが受け取る。相手にはhost:updatedが次に届くことも検証する。
    await receive(a, "note:updated");
    const before = await readProgress(roomId);
    expect(before.note_vote_stickers).toHaveLength(1);
    expect(before.groups).toHaveLength(1);
    expect(before.progress_history.length).toBeGreaterThan(0);
    await transfer(a, b, B.sub, 0);
    expect(await readProgress(roomId)).toEqual(before);
    send(a, { type: "note:vote", noteId: noteIds[0], kind: "objective" });
    await receive(a, "note:updated");
    expect((await readProgress(roomId)).note_vote_stickers).toHaveLength(2);
    const current = (await connect(B, roomId)).snapshot;
    expect(current.notes[0].dotVotes.subjective.count).toBeUndefined();
    expect(current.notes[0].dotVotes.objective.count).toBeUndefined();
    expect(current.notes[0].dotVotes.subjective.ownCount).toBe(0);
    expect(current.notes[0].dotVoteStickers).toEqual([]);
  });

  it("同じ接続から移譲と旧ホスト操作を連送しても旧操作を実行しない", async () => {
    const { stub, a, b } = await setup();
    await stub.setPhase({ kind: "step", phase: 1, step: 1 }, A.sub);
    send(a, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
    });
    send(a, {
      type: "timer:start",
      durationMs: 60_000,
      expectedHostRevision: 0,
    });
    send(a, {
      type: "host:transfer",
      targetUserId: B.sub,
      expectedHostRevision: 0,
    });
    await receive(a, "host:updated");
    await receive(b, "host:updated");
    expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
    expect(await receive(a, "error")).toMatchObject({ code: "forbidden" });
    expect(await stub.getTimerState()).toEqual({ status: "idle" });
    send(b, {
      type: "timer:start",
      durationMs: 60_000,
      expectedHostRevision: 1,
    });
    await receive(a, "timer:updated");
    await receive(b, "timer:updated");
  });
});
