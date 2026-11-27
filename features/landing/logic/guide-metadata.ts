import type { Metadata } from "next";
import { SHARE_IMAGE } from "@/lib/share-image";
import { GUIDE_INDEX } from "./guide-content";
import type { Guide } from "./guide-types";
import { landingUrl, SITE_ORIGIN } from "./landing-metadata";

export const GUIDES_PATH = "/guides";

export function guidePath(slug: string): string {
  return `${GUIDES_PATH}/${slug}`;
}

export function guideUrl(slug: string): string {
  return `${SITE_ORIGIN}${guidePath(slug)}`;
}

const GUIDE_INDEX_URL = `${SITE_ORIGIN}${GUIDES_PATH}`;
const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;

function indexedMetadata(
  title: string,
  description: string,
  url: string,
  type: "article" | "website",
): Metadata {
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Idea Boost",
      locale: "ja_JP",
      type,
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SHARE_IMAGE.url],
    },
    alternates: { canonical: url },
    // 共通レイアウトの既定 noindex を上書きし、解説ページを検索に出す。
    robots: { index: true, follow: true },
  };
}

export function getGuideMetadata(guide: Guide): Metadata {
  return indexedMetadata(
    guide.title,
    guide.description,
    guideUrl(guide.slug),
    "article",
  );
}

export function getGuideIndexMetadata(): Metadata {
  return indexedMetadata(
    GUIDE_INDEX.title,
    GUIDE_INDEX.description,
    GUIDE_INDEX_URL,
    "website",
  );
}

/**
 * 解説ページを schema.org の JSON-LD で表す。記事（Article）・パンくず・よくある質問を、
 * 画面と同じ文言で示す。書き手と発行者は運営の Idea Boost。
 */
export function getGuideStructuredData(guide: Guide): Record<string, unknown> {
  const url = guideUrl(guide.slug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "Idea Boost",
        url: landingUrl("ja"),
        logo: `${SITE_ORIGIN}/icon.png`,
      },
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: guide.heading,
        description: guide.description,
        datePublished: guide.datePublished,
        dateModified: guide.dateModified,
        inLanguage: "ja",
        mainEntityOfPage: url,
        image: `${SITE_ORIGIN}${SHARE_IMAGE.url}`,
        author: { "@id": ORGANIZATION_ID },
        publisher: { "@id": ORGANIZATION_ID },
        keywords: guide.keywords.join(", "),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Idea Boost",
            item: landingUrl("ja"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: GUIDE_INDEX.heading,
            item: GUIDE_INDEX_URL,
          },
          { "@type": "ListItem", position: 3, name: guide.heading, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: "ja",
        mainEntity: guide.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}
