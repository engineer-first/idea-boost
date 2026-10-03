import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { RoomPhase } from "../../contracts/phase";
import type {
  ClientMessage,
  ServerMessage,
} from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
} from "../test-helpers";
import { setDecision } from "./decisions";
import { resetSharingForPhase } from "./sharing-state";
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
const NOTE = "44444444-4444-4444-8444-444444444444";
const OPERATION = "55555555-5555-4555-8555-555555555555";
const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

type Case = {
  type: ClientMessage["type"];
  phase: RoomPhase;
  success: ServerMessage["type"];
};
const writing = { kind: "step", phase: 1, step: 1 } as const;
const grouping = { kind: "step", phase: 1, step: 3 } as const;
const result = { kind: "step", phase: 1, step: 5 } as const;
const cases: Case[] = [
  { type: "start_phase", phase: { kind: "lobby" }, success: "phase:updated" },
  {
    type: "phase:next",
    phase: { kind: "step", phase: 1, step: 4 },
    success: "snapshot",
  },
  { type: "phase:restart-writing", phase: grouping, success: "snapshot" },
  { type: "phase:revote", phase: result, success: "snapshot" },
  ...(
    [
      "timer:start",
      "timer:pause",
      "timer:resume",
      "timer:extend",
      "timer:stop",
    ] as const
  ).map((type) => ({
    type,
    phase: writing,
    success: "timer:updated" as const,
  })),
  ...(["sharing:start", "sharing:advance"] as const).map((type) => ({
    type,
    phase: { kind: "step" as const, phase: 1 as const, step: 2 },
    success: "sharing:updated" as const,
  })),
  ...(["note:exclude", "note:restore"] as const).map((type) => ({
    type,
    phase: result,
    success: "note:updated" as const,
  })),
  { type: "note:bulk-exclude", phase: result, success: "note:updated" },
  { type: "note:bulk-restore", phase: result, success: "note:updated" },
  { type: "note:decide", phase: result, success: "decision:updated" },
  { type: "decision:clear", phase: result, success: "decision:updated" },
  {
    type: "outcome:publish",
    phase: { kind: "step", phase: 3, step: 5 },
    success: "outcome:published",
  },
  {
    type: "adoption-focus:update",
    phase: result,
    success: "adoption-focus:updated",
  },
  {
    type: "idea-map:resize",
    phase: { kind: "step", phase: 3, step: 3 },
    success: "idea-map:state",
  },
];

async function setup(test: Case) {
  const { roomId, inviteCode } = await createRoomAs(A);
  await joinRoomAs(B, inviteCode);
  const a = await connectRoomAs(A, roomId);
  sockets.push(a);
  await a.next();
  const b = await connectRoomAs(B, roomId);
  sockets.push(b);
  await b.next();
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  await stub.setPhase(test.phase, A.sub);
  await runInRoomDO(roomId, (_room, state) => {
    const sql = state.storage.sql;
    // 操作が実行可能な実SQL状態を準備する。要求・認可・配信は本番Workerを通す。
    sql.exec(
      "INSERT INTO notes (id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES (?,?,?,0,0,?,?,'shared',?)",
      NOTE,
      A.sub,
      "採用候補",
      "2026-10-03T00:00:00Z",
      "2026-10-03T00:00:00Z",
      test.phase.kind === "step" ? test.phase.phase : 1,
    );
    if (["note:restore", "note:bulk-restore"].includes(test.type)) {
      sql.exec("UPDATE notes SET excluded=1 WHERE id=?", NOTE);
      sql.exec(
        "INSERT INTO note_bulk_exclusions (note_id,operation_id) VALUES (?,?)",
        NOTE,
        OPERATION,
      );
    }
    if (test.type === "decision:clear")
      setDecision(sql, 1, NOTE, A.sub, "採用候補");
    if (test.type === "outcome:publish")
      for (const phase of [1, 2, 3])
        setDecision(sql, phase, NOTE, A.sub, "採用候補");
    if (test.type === "idea-map:resize")
      sql.exec("UPDATE room_state SET idea_map_size_initialized=1 WHERE id=1");
    if (["timer:pause", "timer:extend"].includes(test.type))
      saveTimerState(sql, {
        status: "running",
        endsAt: Date.now() + 60_000,
        durationMs: 60_000,
      });
    if (["timer:resume", "timer:stop"].includes(test.type))
      saveTimerState(sql, {
        status: "paused",
        remainingMs: 60_000,
        durationMs: 60_000,
      });
    if (test.type.startsWith("sharing:")) {
      resetSharingForPhase(sql, test.phase, test.type === "sharing:advance");
      sql.exec(
        "UPDATE sharing_state SET state_json=json_set(state_json,'$.startsAt',NULL) WHERE id=1",
      );
    }
  });
  const snapshot = await connectRoomAs(A, roomId);
  sockets.push(snapshot);
  const state = await snapshot.next();
  if (state.type !== "snapshot") throw new Error("snapshot missing");
  const message = {
    type: test.type,
    noteId: NOTE,
    durationMs: 60_000,
    sizeLevel: 1,
    operationId: OPERATION,
    revision: state.sharing?.revision,
    outcome: "passed",
    force: true,
    ...(await currentPhaseExpectation(roomId)),
  };
  // strictな要求にも、その種類に属する入力だけを送る。
  const fields: Record<string, unknown> = { type: message.type };
  const add = (...keys: Array<keyof typeof message>) => {
    for (const key of keys) fields[key] = message[key];
  };
  if (
    [
      "note:exclude",
      "note:restore",
      "note:decide",
      "decision:clear",
      "adoption-focus:update",
    ].includes(test.type)
  )
    add("noteId");
  if (test.type === "note:bulk-restore") add("operationId");
  if (test.type === "timer:start" || test.type === "sharing:start")
    add("durationMs");
  if (test.type === "idea-map:resize") add("sizeLevel");
  if (test.type.startsWith("sharing:")) add("revision");
  if (test.type === "sharing:advance") add("outcome");
  if (test.type.startsWith("phase:")) add("expectedPhase", "expectedRevision");
  if (test.type === "phase:next") add("force");
  return { roomId, a, b, message: fields };
}
async function handoff(
  from: RoomSocket,
  to: RoomSocket,
  targetUserId: string,
  revision: number,
) {
  from.ws.send(
    JSON.stringify({
      type: "host:transfer",
      targetUserId,
      expectedHostRevision: revision,
    }),
  );
  expect(await from.next()).toMatchObject({
    type: "host:updated",
    hostRevision: revision + 1,
  });
  expect(await to.next()).toMatchObject({
    type: "host:updated",
    hostRevision: revision + 1,
  });
}

describe("全ホスト操作の現在権限とABA拒否", () => {
  it.each(
    cases,
  )("$type は旧ホスト・復帰後の旧世代を拒否し、新世代を受理する", async (test) => {
    const { roomId, a, b, message } = await setup(test);
    const state = () =>
      runInRoomDO(roomId, (_room, storage) =>
        Object.fromEntries(
          [
            "room_state",
            "timer_state",
            "sharing_state",
            "notes",
            "note_votes",
            "note_vote_stickers",
            "groups",
            "decisions",
            "progress_history",
            "note_bulk_exclusions",
          ].map((table) => [
            table,
            storage.storage.sql.exec(`SELECT * FROM ${table}`).toArray(),
          ]),
        ),
      );
    const before = await state();
    await handoff(a, b, B.sub, 0);
    expect(await state()).toEqual(before);
    a.ws.send(JSON.stringify({ ...message, expectedHostRevision: 1 }));
    expect(await a.next()).toMatchObject({ type: "error", code: "forbidden" });
    await handoff(b, a, A.sub, 1);
    expect(await state()).toEqual(before);
    a.ws.send(JSON.stringify({ ...message, expectedHostRevision: 0 }));
    expect(await a.next()).toMatchObject({ type: "error", code: "forbidden" });
    a.ws.send(JSON.stringify({ ...message, expectedHostRevision: 2 }));
    expect(await a.next()).toMatchObject({ type: test.success });
    expect(await b.next()).toMatchObject({ type: test.success });
    if (test.type === "adoption-focus:update") {
      await handoff(a, b, B.sub, 2);
      for (const socket of [a, b])
        expect(await socket.next()).toEqual({
          type: "adoption-focus:updated",
          noteId: null,
        });
    }
    if (test.type === "outcome:publish") {
      const operationId = crypto.randomUUID();
      a.ws.send(
        JSON.stringify({
          type: "host:transfer",
          targetUserId: B.sub,
          expectedHostRevision: 2,
          operationId,
        }),
      );
      expect(await a.next()).toMatchObject({
        type: "error",
        code: "forbidden",
        operationId,
      });
      expect(
        await runInRoomDO(roomId, (room) => room.getCurrentHost()),
      ).toEqual({ hostUserId: A.sub, hostRevision: 2 });
    }
  });
});
