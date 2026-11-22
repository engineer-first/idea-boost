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
