import { expect, it } from "vitest";
import en from "@/messages/en/app.json";
import ja from "@/messages/ja/app.json";

type Leaves = Record<string, string>;

function leaves(value: unknown, path = ""): Leaves {
  if (typeof value === "string") return { [path]: value };
  if (Array.isArray(value))
    return Object.assign(
      {},
      ...value.map((item, index) => leaves(item, `${path}[${index}]`)),
    );
  return Object.assign(
    {},
    ...Object.entries(value as Record<string, unknown>).map(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key),
    ),
  );
}

// {name} や {count, plural, ...} の引数名だけを取り出す。
function argumentNames(message: string): string[] {
  return [
    ...new Set([...message.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1])),
  ].sort();
}

// 英語だけにある文言。日本語では進行の定義（step-guide-copy）から出している。
const ENGLISH_ONLY = /^stepGuide\.(slides|scamperExamples)[.[]/;

it("日本語と英語の辞書は同じキーを持つ", () => {
  const jaKeys = Object.keys(leaves(ja)).sort();
  const enKeys = Object.keys(leaves(en))
    .filter((key) => !ENGLISH_ONLY.test(key))
    .sort();
  expect(enKeys).toEqual(jaKeys);
});

it("同じキーの文言は、日本語と英語で同じ引数を受け取る", () => {
  const jaLeaves = leaves(ja);
  const enLeaves = leaves(en);
  const mismatched = Object.keys(jaLeaves).filter(
    (key) =>
      enLeaves[key] !== undefined &&
      argumentNames(jaLeaves[key]).join() !==
        argumentNames(enLeaves[key]).join(),
  );
  expect(mismatched).toEqual([]);
});
