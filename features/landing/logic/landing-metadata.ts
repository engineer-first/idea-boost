import type { Metadata } from "next";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "./landing-content";

/** LP の言語ごとの URL。日本語の / を言語が分からないときの版（x-default）にする。 */
export const LANDING_PATHS: Record<AppLocale, string> = { ja: "/", en: "/en" };

const ORIGIN = "https://ideaboost.dev";
const OG_LOCALES: Record<AppLocale, string> = { ja: "ja_JP", en: "en_US" };

function landingUrl(locale: AppLocale): string {
  return `${ORIGIN}${LANDING_PATHS[locale]}`;
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
      languages: {
        ja: landingUrl("ja"),
        en: landingUrl("en"),
        "x-default": landingUrl("ja"),
      },
    },
    // 共通レイアウトの既定 noindex を上書きし、LP だけを検索に出す。
    robots: { index: true, follow: true },
  };
}

export const landingMetadata: Metadata = getLandingMetadata("ja");
