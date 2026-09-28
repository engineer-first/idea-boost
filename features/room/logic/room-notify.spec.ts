// roomNotify ヘルパの単体テスト。sonner の toast 関数をモックして、
// ルーム内通知の文言と呼び出しが期待通りであることを検証する。
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  // toast は関数 + success/error プロパティを持つオブジェクト
  toast: Object.assign(mocks.toast, {
    success: mocks.success,
    error: mocks.error,
  }),
}));

import { roomNotify } from "./room-notify";

describe("roomNotify", () => {
  beforeEach(() => {
    mocks.toast.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  it("memberJoined は toast を「Taro さんが参加しました」で呼ぶ", () => {
    roomNotify.memberJoined("Taro");
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith("Taro さんが参加しました");
  });

  it("memberLeft は toast を「Taro さんが退出しました」で呼ぶ", () => {
    roomNotify.memberLeft("Taro");
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith("Taro さんが退出しました");
  });

  it("roomLeft は toast を「ルームから退出しました」で呼ぶ", () => {
    roomNotify.roomLeft();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith("ルームから退出しました");
  });

  it("roomDisbanded は toast を「ルームが解散されました」で呼ぶ", () => {
    roomNotify.roomDisbanded();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith("ルームが解散されました");
  });

  it("roomDisbandedBySelf は toast を「ルームを解散しました」で呼ぶ", () => {
    roomNotify.roomDisbandedBySelf();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith("ルームを解散しました");
  });

  it("自動整理は結果モーダルを閉じた後もホストがUndoを見つけられるよう保持する", () => {
    const onUndo = vi.fn();

    roomNotify.automaticallyExcludedCandidates(8, onUndo);

    expect(mocks.toast).toHaveBeenCalledWith(
      "投票完了により0票の付箋8件を候補から外しました。必要なら戻せます",
      {
        action: { label: "まとめて元に戻す", onClick: onUndo },
        duration: Number.POSITIVE_INFINITY,
      },
    );
  });
});
