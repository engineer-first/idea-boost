import { expect, it } from "vitest";
import { resolveLocale } from "./locale";

it.each([
  ["ja-JP,ja;q=0.9,en;q=0.8", "ja"],
  ["en-US,en;q=0.9,ja;q=0.8", "en"],
  ["fr-FR,ja;q=0.8", "ja"],
  ["fr-FR,en-US;q=0.8,en;q=0.7", "en"],
  ["fr-FR,fr;q=0.9", "ja"],
  ["en;q=0,ja;q=0.5", "ja"],
  ["en;q=0.9,ja;q=1", "ja"],
  ["ja ;q=1,en;q=0.8", "ja"],
  [",ja", "ja"],
  ["", "ja"],
  [null, "ja"],
] as const)(
  "Accept-Language %s のブラウザが望む言語を %s とみなす",
  (header, expected) => {
    expect(resolveLocale(header)).toBe(expected);
  },
);
