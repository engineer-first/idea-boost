import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Biome の noTailwindRawColors は className 属性と cn() 等の引数しか見ないため、
// 定数の文字列に書いた Tailwind 既定パレットを ast-grep で補って検知する
// （DESIGN.md「値を直接書かない」）。本物のルールで一時プロジェクトを scan する。

const repoRoot = process.cwd();
const astGrepBin = join(repoRoot, "node_modules/.bin/ast-grep");
const rulesDir = join(repoRoot, "rules/ast-grep");
const RULE_ID = /^no-tailwind-palette-in-strings/;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scanPaletteFindings(
  files: Record<string, string>,
): { file: string; text: string }[] {
  const dir = mkdtempSync(join(tmpdir(), "tailwind-palette-rule-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "sgconfig.yml"), `ruleDirs:\n  - ${rulesDir}\n`);
  for (const [path, content] of Object.entries(files)) {
    const filePath = join(dir, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  const result = spawnSync(astGrepBin, ["scan", "--json", "."], {
    cwd: dir,
    encoding: "utf8",
  });
  expect(result.error).toBeUndefined();
  expect(result.stdout).not.toBe("");
  const parsed: { ruleId: string; file: string; text: string }[] = JSON.parse(
    result.stdout,
  );
  return parsed
    .filter(({ ruleId }) => RULE_ID.test(ruleId))
    .map(({ file, text }) => ({ file, text }));
}

describe("定数文字列のTailwind既定パレット", () => {
  it("TS・TSXの定数・オブジェクト・テンプレートに書いた既定パレットを検知する", () => {
    const findings = scanPaletteFindings({
      "features/vote/molecules/tone.tsx": [
        'const TONE = { a: "border-rose-700 bg-white" };',
        'const DISABLED = "disabled:bg-slate-100";',
        // 一時ファイルに書くテンプレートリテラル。ここでは展開させない。
        `const RING = \`ring-2 \${TONE.a} ring-blue-700/75\`;`,
      ].join("\n"),
      "lib/tone.ts": 'export const HOVER = "hover:text-emerald-950";',
      "app/widget.tsx": 'export const W = () => <Card tone="bg-amber-100" />;',
      "components/ui/tone.tsx": 'export const OFFSET = "ring-offset-sky-50";',
    });

    expect(findings.map(({ file, text }) => `${file}:${text}`)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /features\/vote\/molecules\/tone\.tsx:.*rose-700/,
        ),
        expect.stringMatching(
          /features\/vote\/molecules\/tone\.tsx:.*slate-100/,
        ),
        expect.stringMatching(
          /features\/vote\/molecules\/tone\.tsx:.*blue-700/,
        ),
        expect.stringMatching(/lib\/tone\.ts:.*emerald-950/),
        expect.stringMatching(/app\/widget\.tsx:.*amber-100/),
        expect.stringMatching(/components\/ui\/tone\.tsx:.*sky-50/),
      ]),
    );
  });

  it("トークン名・白黒・Biomeが見るclassName属性・見本の色を置く場所は検知しない", () => {
    const findings = scanPaletteFindings({
      "features/vote/molecules/tone.tsx": [
        'const TONE = "border-vote-subjective/25 bg-white text-black ring-offset-background";',
        'const LABEL = "rose-700 という色名の説明";',
        'export const X = () => <div className="bg-rose-100" />;',
      ].join("\n"),
      "features/vote/molecules/tone.stories.tsx":
        'const SAMPLE = "bg-slate-950";',
      "features/vote/molecules/tone.spec.tsx": 'const EXPECTED = "bg-rose-50";',
      "features/vote/tone.fixture.ts": 'export const F = "bg-rose-50";',
      "features/vote/tone.fixture.tsx": 'export const G = "bg-rose-50";',
      "app/mocks/handlers.ts": 'export const H = "bg-rose-50";',
      "features/room/molecules/step-guide-illustration.tsx":
        'const ILLUSTRATION = "bg-sky-100";',
    });

    expect(findings).toEqual([]);
  });
});
