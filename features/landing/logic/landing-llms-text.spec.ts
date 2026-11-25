// AI アシスタントが IdeaBoost を正しく紹介できるよう、LP の中身を llms.txt で渡す（#1042）。
import { describe, expect, it } from "vitest";
import { getLandingContent } from "./landing-content";
import { getLandingLlmsText } from "./landing-llms-text";

const ja = getLandingContent("ja").landingCopy;
const en = getLandingContent("en").landingCopy;

describe("llms.txt", () => {
  const text = getLandingLlmsText();

  it("llmstxt.org の形で、名前の見出しと要約の引用から始める", () => {
    const lines = text.split("\n");
    expect(lines[0]).toBe("# Idea Boost");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe(`> ${ja.description}`);
  });

  it("進め方・機能・始め方・よくある質問を LP と同じ文言で載せる", () => {
    for (const step of ja.steps) {
      expect(text).toContain(`${step.title}：${step.description}`);
    }
    for (const item of ja.features.items) {
      expect(text).toContain(`${item.title}：${item.description}`);
    }
    for (const step of ja.gettingStarted.steps) {
      expect(text).toContain(`${step.title}：${step.description}`);
    }
    for (const item of ja.faq.items) {
      expect(text).toContain(`### ${item.question}\n\n${item.answer}`);
    }
  });

  it("日本語と英語の LP、保存とプライバシーへのリンクを示す", () => {
    expect(text).toContain("](https://ideaboost.dev/)");
    expect(text).toContain("](https://ideaboost.dev/en)");
    expect(text).toContain("](https://ideaboost.dev/privacy)");
  });

  it("英語で読む AI のために英語の要約も載せる", () => {
    expect(text).toContain("## English");
    expect(text).toContain(en.description);
  });

  it("Google の製品ではないことを明記する", () => {
    expect(text).toContain(ja.disclaimer);
  });
});
