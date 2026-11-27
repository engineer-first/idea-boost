import { designSprintGuide } from "./guide-design-sprint";
import { hackathonIdeaGuide } from "./guide-hackathon-idea";
import { howMightWeGuide } from "./guide-how-might-we";
import type { Guide } from "./guide-types";

/** 公開している解説ページ。一覧・サイトマップ・llms.txt はこの順に並べる。 */
export const GUIDES: readonly Guide[] = [
  hackathonIdeaGuide,
  howMightWeGuide,
  designSprintGuide,
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

/** 解説ページの記事の外側の固定文言。 */
export const GUIDE_UI = {
  breadcrumb: "パンくずリスト",
  toc: "目次",
  faq: "よくある質問",
  related: "関連するガイド",
  sources: "出典",
  published: "公開",
  modified: "更新",
  start: {
    heading: "この進め方を、Idea Boostで試す",
    description:
      "Idea Boostは、課題・問い・案の順にチームのアイデアを決めるWebアプリです。画面のガイドとタイマーに沿って進めるので、進行役がいなくても使えます。無料です。",
    about: "Idea Boostについて",
  },
} as const;

/** 記事の外側の節が使う id。記事の節の id に使わない。 */
export const GUIDE_RESERVED_IDS = ["faq", "start", "related", "sources"];

/** 解説の一覧ページの見出しと説明。 */
export const GUIDE_INDEX = {
  title: "アイデア出しのガイド | Idea Boost",
  heading: "アイデア出しのガイド",
  description:
    "ハッカソン・ビジコン・チーム制作で、チームのアイデアを決める進め方の解説。困りごとの出し方、「どうしたら〜できる？」の問いの作り方、票の入れ方まで。",
} as const;
