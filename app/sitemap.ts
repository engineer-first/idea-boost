import type { MetadataRoute } from "next";
import { landingLanguageAlternates, landingUrl } from "@/features/landing";

// 検索に出すのは LP だけ（#993）。各言語の LP を互いの言語版つきで載せる。
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = landingLanguageAlternates();
  return (["ja", "en"] as const).map((locale) => ({
    url: landingUrl(locale),
    changeFrequency: "weekly",
    priority: locale === "ja" ? 1 : 0.8,
    alternates: { languages },
  }));
}
