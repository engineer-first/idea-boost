import type { MetadataRoute } from "next";
import {
  GUIDES,
  GUIDES_PATH,
  guideUrl,
  landingLanguageAlternates,
  landingUrl,
  SITE_ORIGIN,
} from "@/features/landing";

// 検索に出すのは LP と解説ページ（#993）。各言語の LP を互いの言語版つきで載せる。
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = landingLanguageAlternates();
  const landing = (["ja", "en"] as const).map((locale) => ({
    url: landingUrl(locale),
    changeFrequency: "weekly" as const,
    priority: locale === "ja" ? 1 : 0.8,
    alternates: { languages },
  }));
  const latest = GUIDES.map((guide) => guide.dateModified)
    .sort()
    .at(-1);
  return [
    ...landing,
    {
      url: `${SITE_ORIGIN}${GUIDES_PATH}`,
      lastModified: latest,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...GUIDES.map((guide) => ({
      url: guideUrl(guide.slug),
      lastModified: guide.dateModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
