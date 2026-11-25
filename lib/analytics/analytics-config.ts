export type AnalyticsSettings = { key: string; host: string };

type AnalyticsEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
};

const DEFAULT_HOST = "https://us.i.posthog.com";

/**
 * 計測を有効にするかと送信先。本番ビルドで PostHog のプロジェクトキーがあるときだけ有効にする。
 * キーが無ければ何も読み込まず、何も送らない。
 */
export function getAnalyticsSettings(
  env: AnalyticsEnv,
): AnalyticsSettings | null {
  if (env.NODE_ENV !== "production") return null;
  const key = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  return { key, host: env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_HOST };
}
