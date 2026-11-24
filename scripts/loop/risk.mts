// 変更ファイルからリスク段階（docs/loop/README.md）を決める。作った周回の自己申告に頼らないための機械判定。
// 上から順に最初に当たった規則を使い、ファイルごとの最も高い段階を PR の段階にする。一覧に無い場所は R1 に倒す。
// 使い方: gh pr diff <N> --name-only | node scripts/loop/risk.mts   → R0 / R1 / R2 を出力
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Risk = "R0" | "R1" | "R2";

const rules: { pattern: RegExp; risk: Risk }[] = [
  // ループ自身と、検査・設定・指示を縛るもの。ループが自分の規則を緩めてマージしないよう人が見る。
  {
    pattern:
      /^(docs\/loop|scripts|\.claude|\.agents|\.codex|\.github|rules|\.tbls)\/|^(AGENTS\.md|CLAUDE\.md|biome\.json|tsconfig[^/]*\.json|package(-lock)?\.json|renovate\.json|\.coderabbit\.yaml|sgconfig\.yml|mise\.toml|opencode\.json|vitest[^/]*\.mts|wrangler[^/]*\.jsonc|next\.config\.ts|open-next\.config\.ts)$/,
    risk: "R2",
  },
  // 境界：worker・RoomDO・migration・データの形・セッション・リアルタイム通信・認証・Server Action・Route Handler・運営画面。
  {
    pattern:
      /^(workers|contracts|lib\/session|lib\/room-client|features\/auth|features\/feedback|app\/api|app\/auth|app\/admin)\/|(^|\/)[^/]*actions?\.ts$|(^|\/)route\.ts$|(^|\/)proxy\.ts$/,
    risk: "R2",
  },
  // 戻せるもの：文書・テスト・stories・文言。
  {
    pattern:
      /^(docs|tests|messages)\/|\.md$|\.(spec|test)\.tsx?$|\.stories\.tsx$/,
    risk: "R0",
  },
  // 画面とロジック。
  {
    pattern: /^(app|features|components|lib|public|i18n)\//,
    risk: "R1",
  },
];

const order: Risk[] = ["R0", "R1", "R2"];

export function riskOf(files: string[]): Risk {
  let max: Risk = "R0";
  for (const f of files) {
    const r = rules.find((x) => x.pattern.test(f))?.risk ?? "R1";
    if (order.indexOf(r) > order.indexOf(max)) max = r;
  }
  return max;
}

const isMain = (() => {
  try {
    return (
      realpathSync(fileURLToPath(import.meta.url)) ===
      realpathSync(process.argv[1] ?? "")
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  const files = readFileSync(0, "utf8").split("\n").filter(Boolean);
  console.log(riskOf(files));
}
