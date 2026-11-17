import type { Metadata } from "next";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "./landing-content";
import { landingCopy } from "./landing-copy";

export const landingMetadata: Metadata = {
  title: landingCopy.title,
  description: landingCopy.description,
  alternates: { canonical: "https://ideaboost.dev/" },
  // 共通レイアウトの既定 noindex を上書きし、LP だけを検索に出す。
  robots: { index: true, follow: true },
};

export function getLandingMetadata(locale: AppLocale): Metadata {
  const copy = getLandingContent(locale).landingCopy;
  return {
    ...landingMetadata,
    title: copy.title,
    description: copy.description,
    openGraph: {
      type: "website",
      locale: locale === "ja" ? "ja_JP" : "en_US",
      title: copy.title,
      description: copy.description,
      url: "https://ideaboost.dev/",
    },
  };
}
