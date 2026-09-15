import { describe, expect, it } from "vitest";
import { getDemoScript } from "./demo-copy";

describe("5分デモの台本", () => {
  it("課題グループ化では今できる整理と投票への進行を案内する", () => {
    const script = getDemoScript({ kind: "step", phase: 1, step: 3 });
    expect(script).toContain("似た課題");
    expect(script).toContain("投票");
    expect(script).not.toContain("共有を合図");
  });
  it("次フェーズでホストが自分の付箋を作る内容を案内する", () => {
    expect(getDemoScript({ kind: "step", phase: 2, step: 1 })).toContain(
      "どうすれば、空きコマに気軽に学び合う仲間と出会えるだろう？",
    );
    expect(getDemoScript({ kind: "step", phase: 3, step: 1 })).toContain(
      "空きコマ勉強マッチ",
    );
  });
  it("決定の場面で課題・問い・アイデアのおすすめを具体的に示す", () => {
    expect(getDemoScript({ kind: "step", phase: 1, step: 5 })).toContain(
      "空きコマに一緒に勉強する仲間が見つからない",
    );
    expect(getDemoScript({ kind: "step", phase: 3, step: 5 })).toContain(
      "空きコマ勉強マッチ",
    );
  });
});
