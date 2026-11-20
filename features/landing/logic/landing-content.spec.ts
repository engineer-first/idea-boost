import { describe, expect, it } from "vitest";
import en from "@/messages/en/landing.json";

describe("英語版LPの文言", () => {
  it("成果カードを含む表示文言に日本語を残さない", () => {
    expect(
      JSON.stringify(en).match(/[\u3040-\u30ff\u3400-\u9fff]/u),
    ).toBeNull();
  });
});
