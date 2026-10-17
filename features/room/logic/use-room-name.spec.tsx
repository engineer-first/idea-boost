import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@/contracts/room-protocol";

import { useRoomName } from "./use-room-name";

describe("ルーム名の編集", () => {
  it("取消・不正入力では送信せず、保存中の二重送信を防ぎ、失敗後も入力を残す", () => {
    const send = vi.fn((_message: ClientMessage) => true);
    const { result } = renderHook(() =>
      useRoomName({ connected: true, blocked: false, send }),
    );
    act(() =>
      result.current.applyMessage({
        type: "snapshot",
        notes: [],
        members: [],
        phase: { kind: "lobby" },
        phaseRevision: 0,
        isHost: false,
        decision: null,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: 0,
        roomName: null,
      }),
    );
    act(() => result.current.request());
    act(() => result.current.onDraftChange("　 "));
    act(() => result.current.onConfirm());
    expect(send).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    act(() => result.current.onDraftChange("あ".repeat(16)));
    act(() => result.current.onConfirm());
    expect(send).not.toHaveBeenCalled();
    expect(result.current.error).toContain("15文字以内");
    act(() => result.current.onDraftChange("J05"));
    act(() => result.current.onOpenChange(false));
    expect(send).not.toHaveBeenCalled();
    act(() =>
      result.current.applyMessage({
        type: "snapshot",
        notes: [],
        members: [],
        phase: { kind: "lobby" },
        phaseRevision: 0,
        isHost: false,
        decision: null,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: 0,
        roomName: null,
      }),
    );
    act(() => result.current.request());
    expect(result.current.draft).toBe("");
    act(() => result.current.onDraftChange(" J05 "));
    act(() => {
      result.current.onConfirm();
      result.current.onConfirm();
    });
    expect(send).toHaveBeenCalledOnce();
    const operationId = (
      send.mock.calls[0][0] as Extract<ClientMessage, { type: "room:rename" }>
    ).operationId;
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "再試行してください",
        operationId,
      }),
    );
    expect(result.current.open).toBe(true);
    expect(result.current.draft).toBe(" J05 ");
    act(() => result.current.onConfirm());
    const secondId = (
      send.mock.calls[1][0] as Extract<ClientMessage, { type: "room:rename" }>
    ).operationId;
    act(() =>
      result.current.applyMessage({
        type: "room:renamed",
        name: "J05",
        operationId: secondId,
      }),
    );
    expect(result.current.name).toBe("J05");
    expect(result.current.open).toBe(false);
  });
  it("他の参加者の変更は編集中の入力を壊さず反映し、切断・完了後は保存しない", () => {
    const send = vi.fn(() => true);
    const { result, rerender } = renderHook(
      (options) => useRoomName({ ...options, send }),
      { initialProps: { connected: true, blocked: false } },
    );
    act(() =>
      result.current.applyMessage({
        type: "snapshot",
        notes: [],
        members: [],
        phase: { kind: "lobby" },
        phaseRevision: 0,
        isHost: false,
        decision: null,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: 0,
        roomName: null,
      }),
    );
    act(() => result.current.request());
    act(() => result.current.onDraftChange("入力中"));
    act(() =>
      result.current.applyMessage({
        type: "room:renamed",
        name: "J06",
        operationId: crypto.randomUUID(),
      }),
    );
    expect(result.current.name).toBe("J06");
    expect(result.current.draft).toBe("入力中");
    rerender({ connected: false, blocked: false });
    act(() => result.current.onConfirm());
    rerender({ connected: true, blocked: true });
    act(() => result.current.onConfirm());
    expect(send).not.toHaveBeenCalled();
  });
});
