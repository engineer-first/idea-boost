import type { Metadata } from "next";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "./landing-content";
import { landingCopy } from "./landing-copy";

export const landingMetadata: Metadata = {
  title: landingCopy.title,
  description: landingCopy.description,
  openGraph: {
    title: landingCopy.title,
    description: landingCopy.description,
    url: "https://ideaboost.dev/",
    siteName: "Idea Boost",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "/brand/ogp.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: landingCopy.title,
    description: landingCopy.description,
    images: ["/brand/ogp.png"],
  },
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
