import { getLandingContent } from "./landing-content";
import { landingUrl, SITE_ORIGIN } from "./landing-metadata";

type Item = { title: string; description: string };

function list(items: readonly Item[]): string {
  return items.map((item) => `- ${item.title}：${item.description}`).join("\n");
}

/**
 * AI アシスタント向けの /llms.txt（https://llmstxt.org/ の形）。
 * 内容は LP の文言だけから作り、LP にない宣伝文や約束を足さない。
 */
export function getLandingLlmsText(): string {
  const ja = getLandingContent("ja").landingCopy;
  const en = getLandingContent("en").landingCopy;
  const sections = [
    `# ${ja.brand}`,
    `> ${ja.description}`,
    [
      ja.introduction,
      `${ja.method.description}${ja.method.scope}`,
      ja.disclaimer,
    ].join("\n\n"),
    `## 進め方\n\n${list(ja.steps)}`,
    `## 機能\n\n${list(ja.features.items)}`,
    `## 始め方\n\n${list(ja.gettingStarted.steps)}`,
    `## よくある質問\n\n${ja.faq.items
      .map((item) => `### ${item.question}\n\n${item.answer}`)
      .join("\n\n")}`,
    [
      "## リンク",
      "",
      `- [Idea Boost（日本語）](${landingUrl("ja")})：紹介ページ。ここから無料で始められる`,
      `- [Idea Boost (English)](${landingUrl("en")})：英語の紹介ページ`,
      `- [${ja.privacy}](${SITE_ORIGIN}/privacy)：保存期間と扱う情報`,
      `- [${ja.method.source}](${ja.method.sourceUrl})`,
    ].join("\n"),
    `## English\n\n${en.description}\n\n${en.introduction}\n\n${list(en.features.items).replaceAll("：", ": ")}`,
  ];
  return `${sections.join("\n\n")}\n`;
}
