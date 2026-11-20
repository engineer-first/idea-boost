import { expect, it } from "vitest";
import { resolveLocale } from "./locale";

it.each([
  ["ja-JP,ja;q=0.9,en;q=0.8", "ja"],
  ["en-US,en;q=0.9,ja;q=0.8", "en"],
  ["fr-FR,ja;q=0.8", "en"],
  ["en;q=0.9,ja;q=1", "ja"],
  [null, "en"],
] as const)("Accept-Language %s で表示言語を %s にする", (header, expected) => {
  expect(resolveLocale(header)).toBe(expected);
});
