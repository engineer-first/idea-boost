import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useCandidateOperations } from "./use-candidate-operations";

// 右下の通知（sonner）が出ないことを、通知の呼び出し口ではなく toast で確かめる。
const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: Object.assign(toast, { error: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/notify", () => ({ notify: { error: vi.fn() } }));

function setup() {
  toast.mockClear();
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
  it("除外が確定しても通知は出さず、盤面の除外表示だけを残す", () => {
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
    expect(result.current.notes[0].excluded).toBe(true);
    expect(result.current.isPending).toBe(false);
    expect(toast).not.toHaveBeenCalled();
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
    expect(toast).not.toHaveBeenCalled();
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
    expect(toast).not.toHaveBeenCalled();
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
    expect(toast).not.toHaveBeenCalled();
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
    expect(toast).not.toHaveBeenCalled();
  });
});
