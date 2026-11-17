export type AppLocale = "ja" | "en";

/** ブラウザの最優先言語だけを採用し、日本語以外は英語にする。 */
export function resolveLocale(acceptLanguage: string | null): AppLocale {
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((item, index) => {
      const [language, ...parameters] = item.trim().split(";");
      const quality = parameters.find((part) => part.trim().startsWith("q="));
      const value = quality ? Number(quality.trim().slice(2)) : 1;
      return {
        language: language.toLowerCase(),
        quality: Number.isFinite(value) ? value : 0,
        index,
      };
    })
    .filter((item) => item.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)[0]?.language;
  return preferred === "ja" || preferred?.startsWith("ja-") ? "ja" : "en";
}
