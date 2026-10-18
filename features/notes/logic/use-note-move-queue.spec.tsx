import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ClientMessage,
  MoveReceipt,
  ServerMessage,
} from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useRoomNotes } from "./use-room-notes";

const N = "11111111-1111-4111-8111-111111111111";
const M = "22222222-2222-4222-8222-222222222222";
const ids = [
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
];
const snapshot: Extract<ServerMessage, { type: "snapshot" }> = {
  type: "snapshot",
  phase: { kind: "step", phase: 1, step: 2 },
  phaseRevision: 0,
  groupRevision: 0,
  mapRevision: 0,
  moveProtocolVersion: 1,
  notes: [
    buildNote({ id: N, x: 100, y: 100 }),
    buildNote({ id: M, x: 400, y: 100 }),
  ],
  members: [],
  isHost: true,
  decision: null,
  carryovers: [],
  completedVoterIds: [],
  timer: { status: "running", endsAt: 9999999999999, durationMs: 60000 },
  serverNow: 0,
};
function receipt(index: number, beforeX: number, afterX: number): MoveReceipt {
  const before = {
    noteId: N,
    x: beforeX,
    y: 100,
    positionRevision: index,
    visibilityRevision: 0,
  };
  const after = { ...before, x: afterX, positionRevision: index + 1 };
  return {
    operationId: ids[index],
    phaseRevision: 0,
    coordinateSpace: "canvas",
    before: [before],
    after: [after],
    affected: [after],
    groupsBefore: [],
    groupsAfter: [],
    groupRevisionBefore: 0,
    groupRevisionAfter: 0,
    mapRevision: 0,
    changed: true,
  };
}
function setup() {
  const send = vi.fn((_: ClientMessage) => true);
  let index = 0;
  const hook = renderHook(
    ({ connected }) =>
      useRoomNotes({ send, connected, createNoteDragId: () => ids[index++] }),
    { initialProps: { connected: true } },
  );
  const apply = (message: ServerMessage) =>
    act(() => hook.result.current.applyMessage(message));
  apply(snapshot);
  const start = (id = N) => act(() => hook.result.current.startNoteDrag(id));
  const end = (x: number, id = N) =>
    act(() => hook.result.current.endNoteDrag(id, x, 100));
  const accept = (index: number, from: number, to: number) =>
    apply({
      type: "note:move:result",
      operationId: ids[index],
      status: "accepted",
      receipt: receipt(index, from, to),
    });
  const x = () => hook.result.current.notes.find((n) => n.id === N)?.x;
  return { ...hook, send, apply, start, end, accept, x };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("保存待ち中の連続移動", () => {
  it("マップの配置後に未配置へ戻す操作を待ち行列へ保持して確定する", () => {
    const h = setup();
    h.apply({
      ...snapshot,
      phase: { kind: "step", phase: 3, step: 3 },
      notes: [buildNote({ id: N, x: 50, y: 50, ideaMapPlaced: false })],
    });
    h.start();
    act(() => h.result.current.endNoteDrag(N, 60, 50));
    expect(h.result.current.notes[0].ideaMapPlaced).toBe(true);
    h.start();
    act(() => h.result.current.endNoteDrag(N, 60, 50, false));
    expect(h.result.current.notes[0].ideaMapPlaced).toBe(false);
    const saved = receipt(0, 50, 60);
    saved.coordinateSpace = "map";
    saved.before[0] = { ...saved.before[0], y: 50, ideaMapPlaced: false };
    saved.after[0] = { ...saved.after[0], y: 50, ideaMapPlaced: true };
    h.apply({
      type: "note:move:result",
      operationId: ids[0],
      status: "accepted",
      receipt: saved,
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      ideaMapPlaced: false,
    });
    expect(h.result.current.notes[0].ideaMapPlaced).toBe(false);
  });
  it("3回の短い移動を即時表示し、各成功の版で順番に保存する", () => {
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    h.end(220);
    h.start();
    h.end(180);
    expect(h.x()).toBe(180);
    expect(
      h.send.mock.calls.filter(([m]) => m.type === "note:move:start"),
    ).toHaveLength(1);
    h.accept(0, 100, 150);
    expect(h.x()).toBe(180);
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[1],
      targets: [{ noteId: N, positionRevision: 1 }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: 70, y: 0 },
    });
    h.accept(1, 150, 220);
    expect(h.x()).toBe(180);
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[2],
      targets: [{ noteId: N, positionRevision: 2 }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[2],
      delta: { x: -40, y: 0 },
    });
    h.accept(2, 220, 180);
    expect(h.x()).toBe(180);
    expect(h.result.current.movePending).toBe(false);
  });
  it("先の成功が掴んでいる途中に届いても、座標を戻さず離した位置を保存する", () => {
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    act(() => h.result.current.moveNote(N, 220, 100));
    act(() => vi.advanceTimersByTime(20));
    expect(h.x()).toBe(220);
    h.accept(0, 100, 150);
    expect(h.x()).toBe(220);
    expect(h.result.current.draggingNoteId).toBe(N);
    h.end(240);
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: 90, y: 0 },
    });
  });
  it("自分の確定batchと旧形式echoを競合と誤認しない", () => {
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    h.end(220);
    const note = buildNote({ id: N, x: 150, y: 100, positionRevision: 1 });
    h.apply({
      type: "notes:moved",
      operationId: ids[0],
      notes: [note],
      groups: [],
      groupRevision: 0,
    });
    h.apply({ type: "note:updated", note });
    expect(h.x()).toBe(220);
    h.accept(0, 100, 150);
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
    });
  });
  it("確定batchの受信直後、再描画前に掴んでも最新の版を使う", () => {
    const h = setup();
    h.start();
    h.end(150);
    const note = buildNote({ id: N, x: 150, y: 100, positionRevision: 1 });
    act(() => {
      h.result.current.applyMessage({
        type: "notes:moved",
        operationId: ids[0],
        notes: [note],
        groups: [],
        groupRevision: 0,
      });
      h.result.current.startNoteDrag(N);
      h.result.current.endNoteDrag(N, 220, 100);
      h.result.current.applyMessage({ type: "note:updated", note });
    });
    expect(h.x()).toBe(220);
    h.accept(0, 100, 150);
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[1],
      targets: [{ noteId: N, positionRevision: 1 }],
    });
  });
  it("別の付箋を含む次の複数移動へ、対象ごとに正しい版と移動量を渡す", () => {
    const h = setup();
    h.start();
    h.end(150);
    act(() => h.result.current.startNoteDrag(M, false, [N, M]));
    h.end(430, M);
    expect(h.x()).toBe(180);
    expect(h.result.current.notes.find((n) => n.id === M)?.x).toBe(430);
    h.accept(0, 100, 150);
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      targets: [
        { noteId: N, positionRevision: 1 },
        { noteId: M, positionRevision: 0 },
      ],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      delta: { x: 30, y: 0 },
    });
  });
  it("現在掴んでいる操作だけを取り消し、離し終わった先の2操作は保存する", () => {
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    h.end(220);
    h.start();
    act(() => h.result.current.moveNote(N, 270, 100));
    act(() => h.result.current.cancelNoteDrag(N));
    expect(h.x()).toBe(220);
    h.accept(0, 100, 150);
    h.accept(1, 150, 220);
    expect(h.x()).toBe(220);
    expect(
      h.send.mock.calls.filter(([m]) => m.type === "note:move:start"),
    ).toHaveLength(2);
    expect(h.result.current.movePending).toBe(false);
  });
  it.each([
    "rejected",
    "unknown",
  ] as const)("先の結果が%sなら未送信分を保存しない", (status) => {
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    h.end(220);
    expect(h.x()).toBe(220);
    h.apply({ type: "note:move:result", operationId: ids[0], status });
    expect(h.x()).toBe(100);
    expect(
      h.send.mock.calls.filter(([m]) => m.type === "note:move:start"),
    ).toHaveLength(1);
    expect(h.result.current.movePending).toBe(false);
    expect(h.result.current.moveFeedback).not.toBeNull();
  });
  it.each([
    "cancel",
    "snapshot",
    "phase",
    "peer",
    "disconnect",
    "pause",
  ])("%sで未送信分を破棄し、遅延成功で再開しない", (reason) => {
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    h.end(220);
    expect(h.x()).toBe(220);
    if (reason === "disconnect") h.rerender({ connected: false });
    if (reason === "pause")
      h.apply({
        type: "timer:updated",
        timer: { status: "paused", remainingMs: 30000, durationMs: 60000 },
        serverNow: 0,
      });
    if (reason === "cancel") act(() => h.result.current.cancelNoteDrag());
    if (reason === "snapshot") h.apply(snapshot);
    if (reason === "phase")
      h.apply({
        type: "phase:updated",
        phase: { kind: "step", phase: 1, step: 3 },
        phaseRevision: 1,
      });
    if (reason === "peer")
      h.apply({
        type: "notes:moved",
        operationId: ids[2],
        notes: [buildNote({ id: N, x: 300, y: 100, positionRevision: 2 })],
        groups: [],
        groupRevision: 0,
      });
    h.accept(0, 100, 150);
    expect(
      h.send.mock.calls.filter(([m]) => m.type === "note:move:start"),
    ).toHaveLength(1);
    if (reason === "peer") expect(h.x()).toBe(300);
  });
});
