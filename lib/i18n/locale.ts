import { DEFAULT_APP_LOCALE, type AppLocale } from "@/contracts/app-locale";

export type { AppLocale } from "@/contracts/app-locale";

/** 対応する言語が見つからないときに使う既定の表示言語。 */
export const DEFAULT_LOCALE: AppLocale = DEFAULT_APP_LOCALE;

/** Accept-Language から、最も優先度の高い対応言語を選ぶ。 */
export function resolveLocale(acceptLanguage: string | null): AppLocale {
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((item, index) => {
      const [rawLanguage, ...parameters] = item.split(";");
      const language = rawLanguage.trim().toLowerCase();
      const qualityParameter = parameters.find((part) => part.trim().startsWith("q="));
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
      return { language, quality, index };
    })
    .filter(({ language, quality }) =>
      language !== "" &&
      language !== "*" &&
      Number.isFinite(quality) &&
      quality > 0 &&
      quality <= 1
    )
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { language } of preferred) {
    if (language === "ja" || language.startsWith("ja-")) return "ja";
    if (language === "en" || language.startsWith("en-")) return "en";
  }
  return DEFAULT_LOCALE;
}
