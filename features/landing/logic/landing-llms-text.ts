import { GUIDES } from "./guide-content";
import { guideUrl } from "./guide-metadata";
import { getLandingContent } from "./landing-content";
import { landingUrl, SITE_ORIGIN } from "./landing-metadata";

type Item = { title: string; description: string };

function list(items: readonly Item[], separator = "："): string {
  return items
    .map((item) => `- ${item.title}${separator}${item.description}`)
    .join("\n");
}

/**
 * AI アシスタント向けの /llms.txt（https://llmstxt.org/ の形）。
 * H1・要約の引用・見出しを使わない説明・H2 ごとのリンク一覧の順に並べる。
 * 内容は LP の文言だけから作り、LP にない宣伝文や約束を足さない。
 */
export function getLandingLlmsText(): string {
  const ja = getLandingContent("ja").landingCopy;
  const en = getLandingContent("en").landingCopy;
  const sections = [
    `# ${ja.brand}`,
    `> ${ja.description}`,
    `${ja.background.description}${ja.background.scope}`,
    ja.disclaimer,
    `**進め方**\n\n${list(ja.steps)}`,
    `**機能**\n\n${list(ja.features.items)}`,
    `**始め方**\n\n${list(ja.gettingStarted.steps)}`,
    `**よくある質問**\n\n${ja.faq.items
      .map((item) => `- ${item.question} ${item.answer}`)
      .join("\n")}`,
    `**English**\n\n${en.description}\n\n${list(en.features.items, ": ")}`,
    [
      "## リンク",
      "",
      `- [Idea Boost（日本語）](${landingUrl("ja")}): 紹介ページ。ここから無料で始められる`,
      `- [Idea Boost (English)](${landingUrl("en")}): 英語の紹介ページ`,
      ...GUIDES.map(
        (guide) =>
          `- [${guide.heading}](${guideUrl(guide.slug)}): ${guide.summary}`,
      ),
      `- [${ja.privacy}](${SITE_ORIGIN}/privacy): 保存期間と扱う情報`,
      `- [${ja.background.source}](${ja.background.sourceUrl}): デザインスプリントの出典`,
    ].join("\n"),
  ];
  return `${sections.join("\n\n")}\n`;
}
