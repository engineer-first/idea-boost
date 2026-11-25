// @vitest-environment node
// 計測へ送る URL から、招待コード・ルーム ID・ログイン後の戻り先など
// 個別の会や人を特定できる値を落とし、流入元（utm_*）だけを残す（#1043）。
import { describe, expect, it } from "vitest";
import {
  sanitizeAnalyticsProperties,
  sanitizeAnalyticsUrl,
} from "./analytics-privacy";

describe("sanitizeAnalyticsUrl", () => {
  it.each([
    [
      "https://ideaboost.dev/invite/ABC123",
      "https://ideaboost.dev/invite/:code",
    ],
    [
      "https://ideaboost.dev/rooms/r-1/start",
      "https://ideaboost.dev/rooms/:id/start",
    ],
    [
      "https://ideaboost.dev/completed-rooms/r-1",
      "https://ideaboost.dev/completed-rooms/:id",
    ],
    [
      "https://ideaboost.dev/shared-outcomes/o-1",
      "https://ideaboost.dev/shared-outcomes/:id",
    ],
    ["/rooms/r-1", "/rooms/:id"],
    ["/invite/ABC123?x=1#top", "/invite/:code"],
  ])("ID を含む画面 %s は %s にする", (input, expected) => {
    expect(sanitizeAnalyticsUrl(input)).toBe(expected);
  });

  it("utm_* だけを残し、戻り先などほかのクエリを落とす", () => {
    expect(
      sanitizeAnalyticsUrl(
        "https://ideaboost.dev/login?next=%2Finvite%2FABC123&utm_source=youtube&utm_campaign=hack",
      ),
    ).toBe("https://ideaboost.dev/login?utm_source=youtube&utm_campaign=hack");
  });

  it("外部サイトの参照元は検索語などを含みうるので origin だけにする", () => {
    expect(
      sanitizeAnalyticsUrl("https://www.google.com/search?q=アイデア出し"),
    ).toBe("https://www.google.com");
  });

  it("URL でない値はそのまま返す", () => {
    expect(sanitizeAnalyticsUrl("$direct")).toBe("$direct");
  });
});

describe("sanitizeAnalyticsProperties", () => {
  it("URL・パス・参照元のプロパティと $set / $set_once の中を整える", () => {
    expect(
      sanitizeAnalyticsProperties({
        $current_url: "https://ideaboost.dev/invite/ABC123?next=/rooms/r-1",
        $pathname: "/invite/ABC123",
        $referrer: "https://www.google.com/search?q=x",
        $set_once: { $initial_current_url: "https://ideaboost.dev/rooms/r-1" },
        $set: { $initial_pathname: "/rooms/r-1" },
        $browser: "Chrome",
      }),
    ).toEqual({
      $current_url: "https://ideaboost.dev/invite/:code",
      $pathname: "/invite/:code",
      $referrer: "https://www.google.com",
      $set_once: { $initial_current_url: "https://ideaboost.dev/rooms/:id" },
      $set: { $initial_pathname: "/rooms/:id" },
      $browser: "Chrome",
    });
  });
});
