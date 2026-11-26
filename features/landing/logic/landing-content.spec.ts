import { describe, expect, it } from "vitest";
import en from "@/messages/en/landing.json";
import ja from "@/messages/ja/landing.json";

// 値を捨て、キーと配列の長さだけを残した形にする。
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, shape(child)]),
    );
  return typeof value;
}

describe("英語版LPの文言", () => {
  it("ja と en は同じキー構造（配列の長さを含む）を持つ", () => {
    expect(shape(en)).toEqual(shape(ja));
  });

  it("表示文言に日本語を残さない", () => {
    expect(JSON.stringify(en).match(/[぀-ヿ㐀-鿿]/u)).toBeNull();
  });
});

describe("日本語LPの文言", () => {
  const { landingCopy } = ja;

  it("招待の渡し方は用語集どおり「招待リンク」と呼び、「招待URL」と書かない", () => {
    expect(JSON.stringify(ja)).not.toContain("招待URL");
    expect(landingCopy.gettingStarted.steps[1].description).toContain(
      "招待リンク",
    );
  });

  it("持ち帰り方には、成果画面で選べるPNG保存も挙げる", () => {
    expect(landingCopy.scenes.items[5].description).toContain("PNG");
    expect(landingCopy.gettingStarted.steps[3].description).toContain("PNG");
  });
});
