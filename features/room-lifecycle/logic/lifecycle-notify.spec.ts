// lifecycleNotify ヘルパの単体テスト。sonner の toast 関数をモックして、
// 作成・参加フローの通知文言と呼び出しが期待通りであることを検証する。
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({
  // toast は関数 + success プロパティを持つオブジェクト
  toast: Object.assign(mocks.toast, {
    success: mocks.success,
  }),
}));

import { lifecycleNotify } from "./lifecycle-notify";

describe("lifecycleNotify", () => {
  beforeEach(() => {
    mocks.toast.mockReset();
    mocks.success.mockReset();
  });

  it("roomCreated は toast.success を「ルームを作成しました」で呼ぶ", () => {
    lifecycleNotify.roomCreated();
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith("ルームを作成しました");
  });

  it("joinedAsGuest は toast.success で「ルームに参加しました」を呼ぶ", () => {
    lifecycleNotify.joinedAsGuest();
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith("ルームに参加しました");
  });
});

it("退出通知は到着後に元ルーム名で1回にまとめ、再送・StrictModeでも重複しない", () => {
  mocks.success.mockReset();
  lifecycleNotify.rememberDeparture("destination", "operation", [
    "朝の相談",
    "昼の相談",
  ]);
  expect(mocks.success).not.toHaveBeenCalled();
  lifecycleNotify.arrived("other");
  expect(mocks.success).not.toHaveBeenCalled();
  lifecycleNotify.arrived("destination");
  lifecycleNotify.arrived("destination");
  lifecycleNotify.rememberDeparture("destination", "operation", [
    "朝の相談",
    "昼の相談",
  ]);
  lifecycleNotify.arrived("destination");
  expect(mocks.success).toHaveBeenCalledExactlyOnceWith(
    "朝の相談ほか1件から退出しました",
  );
});
it("元ルームがなければ退出通知を出さない", () => {
  mocks.success.mockReset();
  lifecycleNotify.rememberDeparture("destination", "normal", []);
  lifecycleNotify.arrived("destination");
  expect(mocks.success).not.toHaveBeenCalled();
});

it("翻訳を渡すと、作成・参加・退出の通知をその言語で出す", async () => {
  const { createTranslator } = await import("next-intl");
  const appEn = (await import("@/messages/en/app.json")).default;
  const t = createTranslator({
    locale: "en",
    messages: { app: appEn },
    namespace: "app.notifications",
  }) as (key: string, values?: Record<string, string | number>) => string;
  mocks.success.mockReset();
  lifecycleNotify.roomCreated(t);
  lifecycleNotify.joinedAsGuest(t);
  lifecycleNotify.rememberDeparture("translated", "translated-one", ["Lab"]);
  lifecycleNotify.arrived("translated", t);
  lifecycleNotify.rememberDeparture("translated", "translated-many", [
    "Lab",
    "Club",
    "Class",
  ]);
  lifecycleNotify.arrived("translated", t);
  expect(mocks.success.mock.calls).toEqual([
    ["Room created"],
    ["Joined the room"],
    ["Left Lab"],
    ["Left Lab and 2 more"],
  ]);
});
