// useLeaveRoom（退出 / 解散フロー）の単体テスト。
// leaveRoom Server Action の成否と NEXT_REDIRECT の握りつぶし、
// 多重押下ガード、toast の出し分け（ホスト=解散 / 参加者=退出）を検証する。
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LEAVE_ROOM = vi.fn();
vi.mock("./actions", () => ({
  leaveRoom: (...args: unknown[]) => LEAVE_ROOM(...args),
}));

const notifyMocks = vi.hoisted(() => ({
  error: vi.fn(),
  roomLeft: vi.fn(),
  roomDisbandedBySelf: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({
  notify: { error: notifyMocks.error },
}));
vi.mock("./room-notify", () => ({
  roomNotify: {
    roomLeft: notifyMocks.roomLeft,
    roomDisbandedBySelf: notifyMocks.roomDisbandedBySelf,
    roomDisbanded: vi.fn(),
    memberJoined: vi.fn(),
    memberLeft: vi.fn(),
  },
}));

import { useLeaveRoom } from "./use-leave-room";

const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// 実物の redirect() は NEXT_REDIRECT を digest に持つ例外を投げる。
function nextRedirectError(): Error {
  return Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;replace;/home;303;",
  });
}

describe("useLeaveRoom", () => {
  beforeEach(() => {
    LEAVE_ROOM.mockReset();
    notifyMocks.error.mockReset();
    notifyMocks.roomLeft.mockReset();
    notifyMocks.roomDisbandedBySelf.mockReset();
  });

  it("leave() は isLeaving を立て、ref は setState を待たず同期で立つ", async () => {
    LEAVE_ROOM.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() =>
      useLeaveRoom({ roomId: ROOM_ID, isHost: false }),
    );

    act(() => {
      result.current.leave();
      // act 内（コミット前）でも ref は同期で読める。
      expect(result.current.isLeavingRef.current).toBe(true);
    });

    expect(result.current.isLeaving).toBe(true);
    const formData = LEAVE_ROOM.mock.calls[0]?.[0] as FormData;
    expect(formData.get("roomId")).toBe(ROOM_ID);
  });

  it("成功（NEXT_REDIRECT）で参加者なら roomLeft を toast する", async () => {
    LEAVE_ROOM.mockRejectedValueOnce(nextRedirectError());
    const { result } = renderHook(() =>
      useLeaveRoom({ roomId: ROOM_ID, isHost: false }),
    );

    act(() => result.current.leave());

    await waitFor(() => {
      expect(notifyMocks.roomLeft).toHaveBeenCalledTimes(1);
    });
    expect(notifyMocks.roomDisbandedBySelf).not.toHaveBeenCalled();
    // 遷移中なので isLeaving は立てたまま（ボタンは disabled のまま遷移する）。
    expect(result.current.isLeaving).toBe(true);
  });

  it("成功（NEXT_REDIRECT）でホストなら roomDisbandedBySelf を toast する", async () => {
    LEAVE_ROOM.mockRejectedValueOnce(nextRedirectError());
    const { result } = renderHook(() =>
      useLeaveRoom({ roomId: ROOM_ID, isHost: true }),
    );

    act(() => result.current.leave());

    await waitFor(() => {
      expect(notifyMocks.roomDisbandedBySelf).toHaveBeenCalledTimes(1);
    });
    expect(notifyMocks.roomLeft).not.toHaveBeenCalled();
  });

  it("5xx 等の失敗では error を toast し、再操作できる状態に戻す", async () => {
    LEAVE_ROOM.mockRejectedValueOnce(
      new Error("ルーム退出 API が失敗しました: 503"),
    );
    const { result } = renderHook(() =>
      useLeaveRoom({ roomId: ROOM_ID, isHost: false }),
    );

    act(() => result.current.leave());

    await waitFor(() => {
      expect(notifyMocks.error).toHaveBeenCalledWith(
        "ルーム退出 API が失敗しました: 503",
      );
    });
    expect(result.current.isLeaving).toBe(false);
    expect(result.current.isLeavingRef.current).toBe(false);
  });

  it("処理中の再呼び出しは無視する（多重送信ガード）", async () => {
    LEAVE_ROOM.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() =>
      useLeaveRoom({ roomId: ROOM_ID, isHost: false }),
    );

    act(() => result.current.leave());
    act(() => result.current.leave());

    expect(LEAVE_ROOM).toHaveBeenCalledTimes(1);
  });
});

it("完了後のホストは本人退出を送り、解散通知を出さない", async () => {
  LEAVE_ROOM.mockReset();
  notifyMocks.roomLeft.mockReset();
  notifyMocks.roomDisbandedBySelf.mockReset();
  LEAVE_ROOM.mockRejectedValueOnce(nextRedirectError());
  const { result } = renderHook(() =>
    useLeaveRoom({ roomId: ROOM_ID, isHost: true, completed: true }),
  );
  act(() => result.current.leave());
  await waitFor(() => expect(notifyMocks.roomLeft).toHaveBeenCalledTimes(1));
  expect((LEAVE_ROOM.mock.calls[0]?.[0] as FormData).get("intent")).toBe(
    "self",
  );
  expect(notifyMocks.roomDisbandedBySelf).not.toHaveBeenCalled();
});
