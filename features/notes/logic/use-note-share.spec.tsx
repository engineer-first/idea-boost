import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useNoteShare } from "./use-note-share";

const ID = "11111111-1111-4111-8111-111111111111";
const OP = "22222222-2222-4222-8222-222222222222";
function setup(visibility: "private" | "shared" = "private") {
  const send = vi.fn<(message: ClientMessage) => void>();
  const notes = [
    buildNote({
      id: ID,
      visibility,
      positionRevision: 4,
      visibilityRevision: 3,
    }),
  ];
  const hook = renderHook(() =>
    useNoteShare({ notes, send, createId: () => OP }),
  );
  act(() =>
    hook.result.current.applyMessage({
      type: "snapshot",
      shareProtocolVersion: 1,
      phaseRevision: 9,
    } as ServerMessage),
  );
  return { ...hook, send, notes };
}
describe("共有の結果解決", () => {
  afterEach(() => vi.useRealTimers());
  it("一件の操作ID/専用版で送信し、ACK喪失は再snapshotから照会、再dropで二重送信しない", () => {
    const { result, send } = setup();
    act(() =>
      result.current.commit({ type: "note:publish", noteId: ID, x: 30, y: 40 }),
    );
    expect(send).toHaveBeenCalledWith({
      type: "note:publish",
      noteId: ID,
      x: 30,
      y: 40,
      operationId: OP,
      expectedPhaseRevision: 9,
      expectedPositionRevision: 4,
      expectedVisibilityRevision: 3,
    });
    act(() => {
      result.current.commit({ type: "note:publish", noteId: ID, x: 40, y: 50 });
      result.current.applyMessage({
        type: "snapshot",
        shareProtocolVersion: 1,
        phaseRevision: 10,
      } as ServerMessage);
    });
    expect(
      send.mock.calls.filter(([message]) => message.type === "note:publish"),
    ).toHaveLength(1);
    expect(send).toHaveBeenLastCalledWith({
      type: "note:share:status",
      operationId: OP,
    });
    expect(result.current.pending).toBe(true);
  });
  it("拒否は本人previewを破棄し、他者が確定した最新位置を巻き戻さない", () => {
    const { result, notes } = setup();
    act(() =>
      result.current.commit({ type: "note:publish", noteId: ID, x: 30, y: 40 }),
    );
    expect(result.current.renderNotes(notes)[0].visibility).toBe("private");
    const latest = [{ ...notes[0], x: 600, y: 700 }];
    act(() =>
      result.current.applyMessage({
        type: "note:share:result",
        operationId: OP,
        status: "rejected",
      }),
    );
    expect(result.current.renderNotes(latest)[0]).toEqual(latest[0]);
    expect(result.current.pending).toBe(false);
  });
  it("送信後の工程変更は取消や再送でなく照会し、工程外の成功receiptを捏造しない", () => {
    const { result, send } = setup();
    act(() =>
      result.current.commit({
        type: "note:unpublish",
        noteId: ID,
        privateIndex: 2,
      }),
    );
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phaseRevision: 10,
      } as ServerMessage),
    );
    expect(send).toHaveBeenLastCalledWith({
      type: "note:share:status",
      operationId: OP,
    });
    act(() =>
      result.current.applyMessage({
        type: "note:share:result",
        operationId: OP,
        status: "committed",
      }),
    );
    expect(result.current.receipt).toBeNull();
    expect(result.current.pending).toBe(false);
  });
  it("errorへの再照会は2秒間隔に抑え、照会errorでも応答ループを作らない", () => {
    vi.useFakeTimers();
    const { result, send } = setup();
    act(() =>
      result.current.commit({ type: "note:publish", noteId: ID, x: 30, y: 40 }),
    );
    act(() =>
      result.current.applyMessage({
        type: "error",
        operationId: OP,
        code: "invalid-message",
        message: "通信の結果が不明です",
      }),
    );
    expect(result.current.pending).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2_000));
    expect(send).toHaveBeenLastCalledWith({
      type: "note:share:status",
      operationId: OP,
    });
    act(() =>
      result.current.applyMessage({
        type: "error",
        operationId: OP,
        code: "invalid-message",
        message: "結果照会にも失敗しました",
      }),
    );
    expect(send).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(2_000));
    expect(send).toHaveBeenCalledTimes(3);
    act(() =>
      result.current.applyMessage({
        type: "note:share:result",
        operationId: OP,
        status: "unknown",
      }),
    );
    expect(result.current.pending).toBe(false);
  });
  it("曖昧なerrorの後に成功を確認したら失敗通知を解除する", () => {
    const { result } = setup();
    act(() =>
      result.current.commit({ type: "note:publish", noteId: ID, x: 30, y: 40 }),
    );
    act(() =>
      result.current.applyMessage({
        type: "error",
        operationId: OP,
        code: "invalid-message",
        message: "通信の結果が不明です",
      }),
    );
    act(() =>
      result.current.applyMessage({
        type: "note:share:result",
        operationId: OP,
        status: "committed",
      }),
    );
    expect(result.current.pending).toBe(false);
    expect(result.current.feedback).toBeNull();
  });
  it("戻しのACK待ちは本人だけのprivate投影とし、拒否で最新shared位置をそのまま表示する", () => {
    const { result, notes } = setup("shared");
    act(() =>
      result.current.commit({
        type: "note:unpublish",
        noteId: ID,
        privateIndex: 2,
      }),
    );
    expect(result.current.renderNotes(notes)[0].visibility).toBe("private");
    const latest = [
      { ...notes[0], x: 600, y: 700, stackOrder: 99, positionRevision: 5 },
    ];
    act(() =>
      result.current.applyMessage({
        type: "note:share:result",
        operationId: OP,
        status: "rejected",
      }),
    );
    expect(result.current.renderNotes(latest)).toEqual(latest);
  });
});
