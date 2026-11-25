// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getAnalyticsSettings } from "./analytics-config";

describe("getAnalyticsSettings", () => {
  it("キーが無ければ計測しない", () => {
    expect(getAnalyticsSettings({ NODE_ENV: "production" })).toBeNull();
  });

  it("本番ビルド以外では計測しない（開発の操作を混ぜない）", () => {
    expect(
      getAnalyticsSettings({
        NODE_ENV: "development",
        NEXT_PUBLIC_POSTHOG_KEY: "phc_x",
      }),
    ).toBeNull();
  });

  it("本番でキーがあれば、送信先の既定を US クラウドにして計測する", () => {
    expect(
      getAnalyticsSettings({
        NODE_ENV: "production",
        NEXT_PUBLIC_POSTHOG_KEY: "phc_x",
      }),
    ).toEqual({ key: "phc_x", host: "https://us.i.posthog.com" });
    expect(
      getAnalyticsSettings({
        NODE_ENV: "production",
        NEXT_PUBLIC_POSTHOG_KEY: "phc_x",
        NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
      })?.host,
    ).toBe("https://eu.i.posthog.com");
  });
});
