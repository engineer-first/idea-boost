import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useCandidateOperations } from "./use-candidate-operations";

const excluded = vi.hoisted(() =>
  vi.fn<(undo: () => void) => string>(() => "notice"),
);
vi.mock("./room-notify", () => ({
  roomNotify: { noteExcluded: excluded, dismissCandidateNotice: vi.fn() },
}));
vi.mock("@/lib/notify", () => ({ notify: { error: vi.fn() } }));

function setup() {
  excluded.mockClear();
  const send = vi.fn<(message: ClientMessage) => void>();
  const notes = [buildNote({ id: "a", x: 10 }), buildNote({ id: "b", x: 20 })];
  return {
    send,
    notes,
    ...renderHook((props) => useCandidateOperations({ ...props, send }), {
      initialProps: { notes, connected: true },
    }),
  };
}

describe("候補操作", () => {
  it("一括操作待ちで押した別付箋の個別Undoも消費せず送信する", () => {
    const { result, send, notes, rerender } = setup();
    act(() => result.current.exclude("a"));
    const request = send.mock.calls[0][0];
    if (!("operationId" in request)) throw new Error("IDが必要です");
    const note = {
      ...notes[0],
      excluded: true,
      exclusionOperationId: request.operationId,
    };
    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note,
        operationId: request.operationId,
      }),
    );
    rerender({ notes: [note, notes[1]], connected: true });
    const bulkId = crypto.randomUUID();
    act(() => result.current.bulkRestore(bulkId));
    act(() => excluded.mock.calls[0][0]());
    expect(send).toHaveBeenCalledTimes(2);
    act(() =>
      result.current.applyMessage({
        type: "note:bulk-restored",
        operationId: bulkId,
        count: 1,
      }),
    );
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "note:restore",
        noteId: "a",
        expectedExclusionOperationId: request.operationId,
      }),
    );
  });

  it("別付箋の個別操作待ちで押した一括UndoをACK後に送信する", () => {
    const { result, send, notes } = setup();
    const bulkId = crypto.randomUUID();
    act(() => result.current.exclude("b"));
    const request = send.mock.calls[0][0];
    if (!("operationId" in request)) throw new Error("IDが必要です");
    act(() => result.current.bulkRestore(bulkId));
    expect(send).toHaveBeenCalledOnce();
    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: {
          ...notes[1],
          excluded: true,
          exclusionOperationId: request.operationId,
        },
        operationId: request.operationId,
      }),
    );
    expect(send).toHaveBeenLastCalledWith({
      type: "note:bulk-restore",
      operationId: bulkId,
    });
    expect(result.current.isPending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "note:bulk-restored",
        operationId: bulkId,
        count: 1,
      }),
    );
    expect(result.current.isPending).toBe(false);
  });

  it("新しい位置更新の後に届いた古い成功応答は確定処理だけ行い盤面へ再適用しない", () => {
    const { result, send, notes, rerender } = setup();
    act(() => result.current.exclude("a"));
    const request = send.mock.calls[0][0];
    if (!("operationId" in request)) throw new Error("操作IDが必要です");
    rerender({
      notes: [
        {
          ...notes[0],
          x: 95,
          excluded: true,
          exclusionOperationId: request.operationId,
          updatedAt: "2026-07-03T00:00:01.000Z",
        },
        notes[1],
      ],
      connected: true,
    });
    let handled = false;
    act(() => {
      handled = result.current.applyMessage({
        type: "note:updated",
        operationId: request.operationId,
        note: {
          ...notes[0],
          excluded: true,
          exclusionOperationId: request.operationId,
        },
      });
    });
    expect(handled).toBe(true);
    expect(result.current.isPending).toBe(false);
    expect(result.current.notes[0].x).toBe(95);
    expect(excluded).toHaveBeenCalledOnce();
  });

  it("同じ付箋の二重送信を止め、別付箋と移動は独立させる", () => {
    const { result, send, notes, rerender } = setup();
    act(() => {
      result.current.exclude("a");
      result.current.exclude("a");
      result.current.exclude("b");
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.pendingNoteIds).toEqual(["a", "b"]);
    rerender({ notes: [{ ...notes[0], x: 90 }, notes[1]], connected: true });
    expect(result.current.notes[0]).toMatchObject({ excluded: true, x: 90 });
    expect(excluded).not.toHaveBeenCalled();
  });
  it("拒否時には最新状態を使い、位置を戻さず成功通知も出さない", () => {
    const { result, send, notes, rerender } = setup();
    act(() => result.current.exclude("a"));
    const message = send.mock.calls[0][0];
    if (!("operationId" in message)) throw new Error("操作IDが必要です");
    rerender({ notes: [{ ...notes[0], x: 90 }, notes[1]], connected: true });
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "拒否",
        operationId: message.operationId,
      }),
    );
    expect(result.current.notes[0]).toMatchObject({ excluded: false, x: 90 });
    expect(result.current.isPending).toBe(false);
    expect(excluded).not.toHaveBeenCalled();
  });
  it("別付箋の操作と移動では元のUndoを失効させない", () => {
    const { result, send, notes, rerender } = setup();
    act(() => result.current.exclude("a"));
    const request = send.mock.calls[0][0];
    if (!("operationId" in request)) throw new Error("操作IDが必要です");
    const note = {
      ...notes[0],
      excluded: true,
      exclusionOperationId: request.operationId,
    };
    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note,
        operationId: request.operationId,
      }),
    );
    rerender({ notes: [{ ...note, x: 95 }, notes[1]], connected: true });
    act(() => result.current.exclude("b"));
    const undo = excluded.mock.calls[0]?.[0] as () => void;
    act(() => undo());
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "note:restore",
        noteId: "a",
        expectedExclusionOperationId: request.operationId,
      }),
    );
    expect(result.current.notes[0].x).toBe(95);
  });
  it("別タブで再除外された候補を古いUndoで戻さない", () => {
    const { result, send, notes, rerender } = setup();
    act(() => result.current.exclude("a"));
    const request = send.mock.calls[0][0];
    if (!("operationId" in request)) throw new Error("操作IDが必要です");
    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: {
          ...notes[0],
          excluded: true,
          exclusionOperationId: request.operationId,
        },
        operationId: request.operationId,
      }),
    );
    rerender({
      notes: [
        {
          ...notes[0],
          excluded: true,
          exclusionOperationId: crypto.randomUUID(),
        },
        notes[1],
      ],
      connected: true,
    });
    const undo = excluded.mock.calls[0]?.[0];
    if (typeof undo !== "function") throw new Error("取消操作がありません。");
    act(() => undo());
    expect(send).toHaveBeenCalledOnce();
  });
  it("切断で停止し、遅れた成功応答では通知や旧状態を復活させない", () => {
    const { result, send, notes, rerender } = setup();
    act(() => result.current.exclude("a"));
    const request = send.mock.calls[0][0];
    if (!("operationId" in request)) throw new Error("操作IDが必要です");
    rerender({ notes, connected: false });
    expect(result.current.isPending).toBe(false);
    act(() => result.current.restore("a"));
    expect(send).toHaveBeenCalledOnce();
    let ignored = false;
    act(() => {
      ignored = result.current.applyMessage({
        type: "note:updated",
        operationId: request.operationId,
        note: { ...notes[0], excluded: true },
      });
    });
    expect(ignored).toBe(true);
    expect(excluded).not.toHaveBeenCalled();
  });
});
