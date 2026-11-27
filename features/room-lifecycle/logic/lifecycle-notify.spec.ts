// lifecycleNotify ヘルパの単体テスト。sonner の toast 関数をモックして、
// 作成・参加フローの通知文言と呼び出しが期待通りであることを検証する。
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import appEn from "@/messages/en/app.json";
import appJa from "@/messages/ja/app.json";

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

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;
function translator(locale: "ja" | "en"): Translate {
  return createTranslator({
    locale,
    messages: { app: locale === "en" ? appEn : appJa },
    namespace: "app.notifications",
  }) as Translate;
}
const ja = translator("ja");

describe("lifecycleNotify", () => {
  beforeEach(() => {
    mocks.toast.mockReset();
    mocks.success.mockReset();
  });

  it("roomCreated は toast.success を「ルームを作成しました」で呼ぶ", () => {
    lifecycleNotify.roomCreated(ja);
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith("ルームを作成しました");
  });

  it("joinedAsGuest は toast.success で「ルームに参加しました」を呼ぶ", () => {
    lifecycleNotify.joinedAsGuest(ja);
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
  lifecycleNotify.arrived("other", ja);
  expect(mocks.success).not.toHaveBeenCalled();
  lifecycleNotify.arrived("destination", ja);
  lifecycleNotify.arrived("destination", ja);
  lifecycleNotify.rememberDeparture("destination", "operation", [
    "朝の相談",
    "昼の相談",
  ]);
  lifecycleNotify.arrived("destination", ja);
  expect(mocks.success).toHaveBeenCalledExactlyOnceWith(
    "朝の相談ほか1件から退出しました",
  );
});
it("元ルームがなければ退出通知を出さない", () => {
  mocks.success.mockReset();
  lifecycleNotify.rememberDeparture("destination", "normal", []);
  lifecycleNotify.arrived("destination", ja);
  expect(mocks.success).not.toHaveBeenCalled();
});

it("翻訳を渡すと、作成・参加・退出の通知をその言語で出す", () => {
  const t = translator("en");
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
