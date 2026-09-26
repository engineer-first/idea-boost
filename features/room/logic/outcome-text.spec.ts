import { describe, expect, it } from "vitest";
import { formatOutcomeText } from "./outcome-text";

describe("formatOutcomeText", () => {
  it("3つの決定だけを見出しと出力日、追記欄付きで出力する", () => {
    const result = formatOutcomeText(
      { issue: "課題\n2行目", hmw: "問い", idea: "採用案" },
      new Date("2026-10-01T03:00:00+09:00"),
    );
    expect(result).toContain("1. 決定した課題\n課題\n2行目");
    expect(result).toContain("2. 決定した問い（HMW）\n問い");
    expect(result).toContain("3. 採用したアイデア\n採用案");
    expect(result).toContain("出力日:");
    expect(result).toContain("次に試すこと\n");
    expect(result).not.toContain("決定日時");
  });
});
