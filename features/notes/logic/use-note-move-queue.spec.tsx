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
  "66666666-6666-4666-8666-666666666666",
  "77777777-7777-4777-8777-777777777777",
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
describe("ドラッグ中の途中位置の送信", () => {
  it("掴んでいる間は40msごとに最新の途中位置を他者向けに送る", () => {
    const h = setup();
    h.start();
    const previews = () =>
      h.send.mock.calls
        .map(([message]) => message)
        .filter((message) => message.type === "note:move:preview");
    act(() => h.result.current.moveNote(N, 110, 100));
    act(() => h.result.current.moveNote(N, 120, 100));
    expect(previews()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(40));
    expect(previews()).toHaveLength(2);
    expect(previews().at(-1)).toMatchObject({ delta: { x: 20, y: 0 } });
  });
});
describe("保存待ち中の連続移動", () => {
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
    act(() => h.result.current.startNoteDrag(M, [N, M]));
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
  it.each(["unknown"] as const)(
    "先の結果が%sなら未送信分を保存しない",
    (status) => {
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
    },
  );
  it.each(["cancel", "snapshot", "phase", "disconnect", "pause"])(
    "%sで未送信分を破棄し、遅延成功で再開しない",
    (reason) => {
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
      h.accept(0, 100, 150);
      expect(
        h.send.mock.calls.filter(([m]) => m.type === "note:move:start"),
      ).toHaveLength(1);
    },
  );
  it("相手の確定で版が進んでも、離し終えた1枚の移動は最新の版で保存する", () => {
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    h.end(220);
    h.apply(peerMoved(300, 2));
    expect(h.x()).toBe(220);
    h.accept(0, 100, 150);
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[1],
      targets: [{ noteId: N, positionRevision: 2 }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: -80, y: 0 },
    });
    expect(h.result.current.moveFeedback).toBeNull();
  });
});
function peerMoved(
  x: number,
  positionRevision: number,
): Extract<ServerMessage, { type: "notes:moved" }> {
  return {
    type: "notes:moved",
    operationId: "99999999-9999-4999-8999-999999999999",
    notes: [buildNote({ id: N, x, y: 100, positionRevision })],
    groups: [],
    groupRevision: 0,
  };
}
const sent = (h: ReturnType<typeof setup>, type: ClientMessage["type"]) =>
  h.send.mock.calls.map(([m]) => m).filter((m) => m.type === type);
describe("相手が動かし終えた直後の同じ付箋の移動", () => {
  it("掴んでいる途中に相手の確定が届いても、戻さず最新の版で掴み直す", () => {
    const h = setup();
    h.start();
    act(() => h.result.current.moveNote(N, 220, 100));
    h.apply(peerMoved(300, 1));
    expect(h.x()).toBe(220);
    expect(h.result.current.draggingNoteId).toBe(N);
    expect(h.result.current.moveFeedback).toBeNull();
    expect(sent(h, "note:move:cancel")).toMatchObject([
      { operationId: ids[0] },
    ]);
    expect(sent(h, "note:move:start").at(-1)).toMatchObject({
      operationId: ids[1],
      targets: [{ noteId: N, positionRevision: 1 }],
    });
    h.end(240);
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: -60, y: 0 },
    });
  });
  it("古い版で断られたら、離した位置を保ったまま最新の版で送り直す", () => {
    const h = setup();
    h.start();
    h.end(220);
    h.apply(peerMoved(300, 1));
    expect(h.x()).toBe(220);
    h.apply({
      type: "note:move:result",
      operationId: ids[0],
      status: "rejected",
      reason: "移動対象の権限・位置・分類が変更されています。",
    });
    expect(h.x()).toBe(220);
    expect(h.result.current.moveFeedback).toBeNull();
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[1],
      targets: [{ noteId: N, positionRevision: 1 }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: -80, y: 0 },
    });
    h.apply({
      type: "note:move:result",
      operationId: ids[1],
      status: "accepted",
    });
    expect(h.result.current.movePending).toBe(false);
  });
  it("相手がまだ掴んでいて断られたら、相手の確定を待って送り直す", () => {
    const h = setup();
    h.start();
    h.end(220);
    h.apply({
      type: "note:move:result",
      operationId: ids[0],
      status: "rejected",
    });
    // 断られる前に送ったcommitへのunknownが後から届いても、待っている移動は消さない。
    h.apply({
      type: "note:move:result",
      operationId: ids[0],
      status: "unknown",
    });
    expect(h.x()).toBe(220);
    expect(h.result.current.moveFeedback).toBeNull();
    expect(sent(h, "note:move:start")).toHaveLength(1);
    h.apply(peerMoved(300, 1));
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[1],
      targets: [{ noteId: N, positionRevision: 1 }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: -80, y: 0 },
    });
  });
  it("送り直しても断られ続けたら、待っていた移動も保存せず元の位置へ戻して知らせる", () => {
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    h.end(220);
    for (const index of [0, 2, 3]) {
      h.apply({
        type: "note:move:result",
        operationId: ids[index],
        status: "rejected",
      });
      act(() => vi.advanceTimersByTime(2_000));
    }
    expect(sent(h, "note:move:start")).toHaveLength(3);
    expect(h.x()).toBe(100);
    expect(h.result.current.movePending).toBe(false);
    expect(h.result.current.moveFeedback).not.toBeNull();
  });
  it("保存待ちの後ろの複数枚の移動は、相手の確定で版が進んだら捨て、遅れた成功でも再開しない", () => {
    const h = setup();
    h.start();
    h.end(150);
    act(() => h.result.current.startNoteDrag(M, [N, M]));
    h.end(430, M);
    h.apply(peerMoved(300, 2));
    h.accept(0, 100, 150);
    expect(sent(h, "note:move:start")).toHaveLength(1);
    expect(h.result.current.moveFeedback).not.toBeNull();
  });
  it("複数枚の移動は、相手の確定で版が進んだら取り消して知らせる", () => {
    const h = setup();
    act(() => h.result.current.startNoteDrag(N, [N, M]));
    act(() => h.result.current.moveNote(N, 220, 100));
    h.apply(peerMoved(300, 1));
    expect(h.x()).toBe(300);
    expect(h.result.current.draggingNoteId).toBeNull();
    expect(h.result.current.moveFeedback).not.toBeNull();
  });
});

const P = "66666666-6666-4666-8666-666666666666";
describe("時間切れの通知", () => {
  it("掴んでいる移動も、離し終えた未送信の移動も取り消さない", () => {
    // 時間切れの後も RoomDO は共有付箋の移動を受け付ける。
    const h = setup();
    h.start();
    h.end(150);
    h.start();
    act(() => h.result.current.moveNote(N, 220, 100));
    h.apply({
      type: "timer:updated",
      timer: { status: "ended", durationMs: 60000 },
      serverNow: 0,
    });
    expect(h.result.current.draggingNoteId).toBe(N);
    h.end(220);
    expect(h.x()).toBe(220);
    expect(h.result.current.moveFeedback).toBeNull();
    h.accept(0, 100, 150);
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: 70, y: 0 },
    });
  });
});
describe("共有の応答待ち中の移動", () => {
  const shared = buildNote({
    id: P,
    visibility: "shared",
    x: 300,
    y: 200,
    positionRevision: 1,
    visibilityRevision: 1,
  });
  function shareSetup() {
    const h = setup();
    h.apply({
      ...snapshot,
      shareProtocolVersion: 1,
      notes: [
        ...snapshot.notes,
        buildNote({ id: P, visibility: "private", x: 0, y: 0 }),
      ],
    });
    // 共有の操作IDが ids[0]、続く移動が ids[1] になる。
    act(() => h.result.current.publishNote(P, 300, 200));
    const note = () => h.result.current.notes.find((n) => n.id === P);
    const sent = (type: ClientMessage["type"]) =>
      h.send.mock.calls.map(([m]) => m).filter((m) => m.type === type);
    const commitShare = () => {
      // RoomDO は確定した付箋を note:inserted で先に配り、その後に結果を返す。
      h.apply({ type: "note:inserted", note: shared });
      h.apply({
        type: "note:share:result",
        operationId: ids[0],
        status: "committed",
        receipt: {
          operationId: ids[0],
          noteId: P,
          phaseRevision: 0,
          before: {
            visibility: "private",
            x: 0,
            y: 0,
            positionRevision: 0,
            visibilityRevision: 0,
          },
          after: {
            visibility: "shared",
            x: 300,
            y: 200,
            positionRevision: 1,
            visibilityRevision: 1,
          },
        },
      });
    };
    return { ...h, note, sent, commitShare };
  }
  it("置いた直後の付箋を応答を待たずに動かせ、共有の確定後にその位置を保存する", () => {
    const h = shareSetup();
    h.start(P);
    act(() => h.result.current.endNoteDrag(P, 340, 220));
    expect(h.note()).toMatchObject({ visibility: "shared", x: 340, y: 220 });
    expect(h.sent("note:move:start")).toHaveLength(0);
    h.commitShare();
    expect(h.note()).toMatchObject({ visibility: "shared", x: 340, y: 220 });
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[1],
      targets: [{ noteId: P, positionRevision: 1, visibilityRevision: 1 }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: 40, y: 20 },
    });
    expect(h.result.current.moveFeedback).toBeNull();
  });
  it("掴んでいる途中に共有が確定したら、そのまま掴み続けて離した位置を保存する", () => {
    const h = shareSetup();
    h.start(P);
    act(() => h.result.current.moveNote(P, 320, 210));
    h.commitShare();
    expect(h.result.current.draggingNoteId).toBe(P);
    expect(h.sent("note:move:start")).toHaveLength(1);
    expect(h.sent("note:move:commit")).toHaveLength(0);
    act(() => h.result.current.endNoteDrag(P, 360, 240));
    expect(h.note()).toMatchObject({ visibility: "shared", x: 360, y: 240 });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[1],
      delta: { x: 60, y: 40 },
    });
  });
  it("応答を待つ間は照会も途中位置も送らず、結果不明の失敗にしない", () => {
    const h = shareSetup();
    h.start(P);
    act(() => h.result.current.endNoteDrag(P, 340, 220));
    act(() => vi.advanceTimersByTime(4_100));
    expect(h.sent("note:move:status")).toHaveLength(0);
    expect(h.sent("note:move:preview")).toHaveLength(0);
    expect(h.sent("note:move:commit")).toHaveLength(0);
    expect(h.note()).toMatchObject({ x: 340, y: 220 });
  });
  it("待つ間に本文の保存の通知が届いても、動かした位置を保つ", () => {
    const h = shareSetup();
    h.start(P);
    act(() => h.result.current.endNoteDrag(P, 340, 220));
    h.apply({
      type: "note:updated",
      note: buildNote({ id: P, visibility: "private", x: 0, y: 0 }),
    });
    expect(h.note()).toMatchObject({ visibility: "shared", x: 340, y: 220 });
    expect(h.result.current.moveFeedback).toBeNull();
    h.commitShare();
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      delta: { x: 40, y: 20 },
    });
  });
  it("同じ付箋を続けて2回動かしたら、2回目は1回目の保存で進んだ版で送る", () => {
    const h = shareSetup();
    h.start(P);
    act(() => h.result.current.endNoteDrag(P, 340, 220));
    h.start(P);
    act(() => h.result.current.endNoteDrag(P, 400, 260));
    expect(h.note()).toMatchObject({ x: 400, y: 260 });
    h.commitShare();
    expect(h.sent("note:move:start")).toHaveLength(1);
    const position = { noteId: P, positionRevision: 1, visibilityRevision: 1 };
    const after = { ...position, x: 340, y: 220, positionRevision: 2 };
    h.apply({
      type: "note:move:result",
      operationId: ids[1],
      status: "accepted",
      receipt: {
        operationId: ids[1],
        phaseRevision: 0,
        coordinateSpace: "canvas",
        before: [{ ...position, x: 300, y: 200 }],
        after: [after],
        affected: [after],
        groupsBefore: [],
        groupsAfter: [],
        groupRevisionBefore: 0,
        groupRevisionAfter: 0,
        mapRevision: 0,
        changed: true,
      },
    });
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[2],
      targets: [{ noteId: P, positionRevision: 2, visibilityRevision: 1 }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[2],
      delta: { x: 60, y: 40 },
    });
    expect(h.note()).toMatchObject({ x: 400, y: 260 });
  });
  it("先の移動の保存待ちの後ろに並んでも、共有と先の保存の両方が済んでから送る", () => {
    const h = shareSetup();
    h.start();
    h.end(150);
    h.start(P);
    act(() => h.result.current.endNoteDrag(P, 340, 220));
    h.commitShare();
    // 先頭は別の付箋の保存待ち。置いた付箋の移動はまだ送らない。
    expect(h.sent("note:move:start")).toHaveLength(1);
    h.apply({
      type: "note:move:result",
      operationId: ids[1],
      status: "accepted",
      receipt: { ...receipt(0, 100, 150), operationId: ids[1] },
    });
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[2],
      targets: [{ noteId: P, positionRevision: 1, visibilityRevision: 1 }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[2],
      delta: { x: 40, y: 20 },
    });
  });
  it("共有が拒否されても、後ろに並んだ別の付箋の移動は送る", () => {
    const h = shareSetup();
    h.start(P);
    act(() => h.result.current.endNoteDrag(P, 340, 220));
    h.start();
    h.end(150);
    expect(h.sent("note:move:start")).toHaveLength(0);
    h.apply({
      type: "note:share:result",
      operationId: ids[0],
      status: "rejected",
    });
    expect(h.send.mock.calls.at(-2)?.[0]).toMatchObject({
      type: "note:move:start",
      operationId: ids[2],
      targets: [{ noteId: N }],
    });
    expect(h.send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: ids[2],
      delta: { x: 50, y: 0 },
    });
    expect(h.x()).toBe(150);
  });
  it.each(["escape", "snapshot", "disconnect", "unmount"])(
    "待つ間の%sでは、RoomDO が知らない移動の取消も照会も送らない",
    (reason) => {
      const h = shareSetup();
      h.start(P);
      act(() => h.result.current.moveNote(P, 340, 220));
      if (reason === "escape") act(() => h.result.current.cancelNoteDrag());
      if (reason === "snapshot") h.apply(snapshot);
      if (reason === "disconnect") h.rerender({ connected: false });
      if (reason === "unmount") h.unmount();
      else {
        act(() => h.result.current.endNoteDrag(P, 360, 240));
        act(() => vi.advanceTimersByTime(4_100));
      }
      for (const type of [
        "note:move:start",
        "note:move:cancel",
        "note:move:status",
        "note:move:commit",
        "note:move:preview",
      ] as const)
        expect(h.sent(type)).toHaveLength(0);
    },
  );
  it("掴んでいる途中に共有が拒否されたら、離しても何も送らない", () => {
    const h = shareSetup();
    h.start(P);
    act(() => h.result.current.moveNote(P, 340, 220));
    h.apply({
      type: "note:share:result",
      operationId: ids[0],
      status: "rejected",
    });
    act(() => h.result.current.endNoteDrag(P, 360, 240));
    expect(h.sent("note:move:start")).toHaveLength(0);
    expect(h.sent("note:move:commit")).toHaveLength(0);
    expect(h.note()).toMatchObject({ visibility: "private" });
  });
  it("マイ付箋へ戻している途中の付箋は動かさない", () => {
    const h = setup();
    h.apply({ ...snapshot, shareProtocolVersion: 1 });
    act(() => h.result.current.unpublishNote(N));
    h.start();
    expect(h.result.current.draggingNoteId).toBeNull();
    expect(
      h.send.mock.calls.filter(([m]) => m.type === "note:move:start"),
    ).toHaveLength(0);
  });
  it("共有が拒否されたら、待たせていた移動を送らずに捨てる", () => {
    const h = shareSetup();
    h.start(P);
    act(() => h.result.current.endNoteDrag(P, 340, 220));
    h.apply({
      type: "note:share:result",
      operationId: ids[0],
      status: "rejected",
      reason: "共有できませんでした。",
    });
    expect(h.note()).toMatchObject({ visibility: "private", x: 0, y: 0 });
    expect(h.sent("note:move:start")).toHaveLength(0);
    expect(h.result.current.movePending).toBe(false);
  });
});
