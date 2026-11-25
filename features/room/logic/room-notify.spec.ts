// roomNotify ヘルパの単体テスト。sonner の toast 関数をモックして、
// ルーム内通知の文言と呼び出しが期待通りであることを検証する。
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  // toast は関数 + success/error プロパティを持つオブジェクト
  toast: Object.assign(mocks.toast, {
    success: mocks.success,
    error: mocks.error,
    dismiss: mocks.dismiss,
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

  it("memberRemoved は外した本人とほかの人で文言を言い分ける", () => {
    roomNotify.memberRemoved("Taro", true);
    roomNotify.memberRemoved("Taro", false);
    expect(mocks.toast).toHaveBeenNthCalledWith(
      1,
      "Taro さんをルームから外しました",
    );
    expect(mocks.toast).toHaveBeenNthCalledWith(
      2,
      "Taro さんがルームから外されました",
    );
  });

  it("removedFromRoom は外された本人に外されたことを伝える", () => {
    roomNotify.removedFromRoom();
    expect(mocks.toast).toHaveBeenCalledWith(
      "ほかの参加者にルームから外されました",
    );
  });

  it("roomLeft は toast を「ルームから退出しました」で呼ぶ", () => {
    roomNotify.roomLeft();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith("ルームから退出しました");
  });

  it("自動整理のお知らせは出しっぱなしにせず、有限の時間で閉じる", () => {
    const onUndo = vi.fn();

    roomNotify.automaticallyExcludedCandidates(8, onUndo);

    expect(mocks.toast).toHaveBeenCalledWith(
      "投票完了により0票の付箋8件を候補から外しました。必要なら戻せます",
      {
        action: { label: "まとめて元に戻す", onClick: onUndo },
        duration: 15_000,
        closeButton: true,
      },
    );
  });
});
