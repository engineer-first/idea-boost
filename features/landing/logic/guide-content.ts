import { hackathonIdeaGuide } from "./guide-hackathon-idea";
import type { Guide } from "./guide-types";

/** 公開している解説ページ。一覧・サイトマップ・llms.txt はこの順に並べる。 */
export const GUIDES: readonly Guide[] = [hackathonIdeaGuide];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

/** 解説の一覧ページの見出しと説明。 */
export const GUIDE_INDEX = {
  title: "アイデア出しのガイド | Idea Boost",
  heading: "アイデア出しのガイド",
  description:
    "ハッカソン・ビジコン・チーム制作で、チームのアイデアを決める進め方の解説。困りごとの出し方、「どうしたら〜できる？」の問いの作り方、票の入れ方まで。",
} as const;
