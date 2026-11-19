// PR の変更ファイルから、重い検査（browser・worker テスト）を回すかを決める。
// 判定できない場所の変更は両方回す（取りこぼしより待ち時間の増加を選ぶ）。
// 使い方: git diff --name-only <base> HEAD | node scripts/ci-scope.mts
//         結果は GITHUB_OUTPUT（無ければ標準出力）へ browser=true/false, workers=true/false で書く。
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type CiScope = { browser: boolean; workers: boolean };

type Rule = { pattern: RegExp; browser: boolean; workers: boolean };

// 上から順に最初に当たった規則を使う。
const rules: Rule[] = [
  // browser 検査は Storybook を配信して実ブラウザで確かめる。画面のコードと検査自体。
  {
    pattern:
      /^(app|features|components|public|tests\/browser|\.storybook)\/|^(\.github\/workflows\/browser\.yml|vitest\.browser\.config\.mts|next\.config\.ts|postcss\.config\.mjs|components\.json|instrumentation-client\.ts|DESIGN\.md)$/,
    browser: true,
    workers: false,
  },
  // Worker / RoomDO / Preview / 検証用 worker のテストが読むもの。
  {
    pattern:
      /^(workers|scripts)\/|^(\.github\/workflows\/ci\.yml|wrangler[^/]*\.jsonc|vitest\.(workers|preview|verification)\.config\.mts)$/,
    browser: false,
    workers: true,
  },
  // 画面と worker の両方が読むもの、依存・ツールの版。
  {
    pattern:
      /^(contracts|lib)\/|^(package\.json|package-lock\.json|tsconfig\.json|mise\.toml)$/,
    browser: true,
    workers: true,
  },
  // 文書・エージェント指示・CI 設定・lint 規則。どちらの結果も変えない。
  {
    pattern:
      /^(docs|\.agents|\.claude|\.codex|\.github|rules|\.tbls|\.release-history)\/|\.md$|^(renovate\.json|opencode\.json|biome\.json|sgconfig\.yml|vitest\.config\.mts|vitest\.setup\.ts)$/,
    browser: false,
    workers: false,
  },
];

export function ciScope(files: readonly string[]): CiScope {
  if (files.length === 0) return { browser: true, workers: true };
  const scope: CiScope = { browser: false, workers: false };
  for (const file of files) {
    const rule = rules.find(({ pattern }) => pattern.test(file));
    scope.browser ||= rule ? rule.browser : true;
    scope.workers ||= rule ? rule.workers : true;
  }
  return scope;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const files = readFileSync(0, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const scope = ciScope(files);
  const output = `browser=${scope.browser}\nworkers=${scope.workers}\n`;
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
  process.stdout.write(output);
}
