import { getAnalyticsSettings } from "./analytics-config";

/**
 * 本番で PostHog のキーが設定されているときだけ、計測を読み込んで始める。
 * キーが無いビルドでは posthog-js を読み込まない。
 */
export async function startAnalytics(): Promise<void> {
  const settings = getAnalyticsSettings({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
  if (!settings) return;
  try {
    const [{ default: posthog }, { getPosthogOptions }] = await Promise.all([
      import("posthog-js"),
      import("./posthog-options"),
    ]);
    posthog.init(settings.key, getPosthogOptions(settings.host));
  } catch (error) {
    // 計測の失敗で画面を止めない。
    console.warn("[analytics] failed to start", error);
  }
}
