export type AppLocale = "ja" | "en";

/** 言語が分からないとき（言語を送らない検索エンジン・AI・SNS の取得を含む）の言語。 */
export const DEFAULT_LOCALE: AppLocale = "ja";

/**
 * ブラウザが最も望む表示言語を返す。表示言語の自動切り替えには使わず、
 * 別の言語の版への案内を出すかどうかの判断にだけ使う。
 */
export function resolveLocale(acceptLanguage: string | null): AppLocale {
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((item, index) => {
      const [language, ...parameters] = item.split(";");
      const quality = parameters.find((part) => part.trim().startsWith("q="));
      const value = quality ? Number(quality.trim().slice(2)) : 1;
      return {
        language: language.trim().toLowerCase(),
        quality: Number.isFinite(value) ? value : 0,
        index,
      };
    })
    .filter((item) => item.language !== "" && item.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)[0]?.language;
  if (preferred === undefined) return DEFAULT_LOCALE;
  return preferred === "ja" || preferred.startsWith("ja-") ? "ja" : "en";
}
