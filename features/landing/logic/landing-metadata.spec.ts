// 利用者が実際に探す言葉で LP が見つかるよう、検索結果に出る title と説明文に検索語を入れる。
import { describe, expect, it } from "vitest";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingMetadata } from "./landing-metadata";

// 検索結果の title は日本語で約30字・英語で約60字を超えると末尾が省かれる。
const TITLE_LIMIT: Record<AppLocale, number> = { ja: 40, en: 65 };

describe.each<[AppLocale, string[], string[]]>([
  [
    "ja",
    ["アイデア出し", "無料"],
    ["ハッカソン", "デザインスプリント", "どうしたら〜できる？"],
  ],
  [
    "en",
    ["brainstorming", "Free"],
    ["hackathon", "design sprint", "How might we"],
  ],
])("%s の LP の検索結果", (locale, titleTerms, descriptionTerms) => {
  const metadata = getLandingMetadata(locale);
  const title = String(metadata.title);
  const description = String(metadata.description);

  it(`title に ${titleTerms.join("・")} とサービス名を入れ、省かれない長さに収める`, () => {
    for (const term of titleTerms) expect(title).toContain(term);
    expect(title).toContain("Idea Boost");
    expect(title.length).toBeLessThanOrEqual(TITLE_LIMIT[locale]);
  });

  it(`説明文に ${descriptionTerms.join("・")} を入れる`, () => {
    for (const term of descriptionTerms) expect(description).toContain(term);
  });
});
