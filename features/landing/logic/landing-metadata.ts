import type { Metadata } from "next";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "./landing-content";

/** LP の言語ごとの URL。日本語の / を言語が分からないときの版（x-default）にする。 */
export const LANDING_PATHS: Record<AppLocale, string> = { ja: "/", en: "/en" };

/** 本番の origin。検索エンジン・SNS・AI へ渡す絶対 URL の基準にする。 */
export const SITE_ORIGIN = "https://ideaboost.dev";
const OG_LOCALES: Record<AppLocale, string> = { ja: "ja_JP", en: "en_US" };

/** 言語ごとの LP の絶対 URL。 */
export function landingUrl(locale: AppLocale): string {
  return `${SITE_ORIGIN}${LANDING_PATHS[locale]}`;
}

/** 各言語の LP と、言語が分からないときの版（hreflang）。 */
export function landingLanguageAlternates(): Record<string, string> {
  return {
    ja: landingUrl("ja"),
    en: landingUrl("en"),
    "x-default": landingUrl("ja"),
  };
}

export function getLandingMetadata(locale: AppLocale): Metadata {
  const { title, description } = getLandingContent(locale).landingCopy;
  const other: AppLocale = locale === "ja" ? "en" : "ja";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: landingUrl(locale),
      siteName: "Idea Boost",
      locale: OG_LOCALES[locale],
      alternateLocale: [OG_LOCALES[other]],
      type: "website",
      images: [{ url: "/brand/ogp.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/brand/ogp.png"],
    },
    // 同じ内容の /about も各言語の LP を正とし、互いの言語版を hreflang で示す。
    alternates: {
      canonical: landingUrl(locale),
      languages: landingLanguageAlternates(),
    },
    // 共通レイアウトの既定 noindex を上書きし、LP だけを検索に出す。
    robots: { index: true, follow: true },
  };
}

export const landingMetadata: Metadata = getLandingMetadata("ja");
