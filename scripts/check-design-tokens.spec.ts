import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const checker = resolve("scripts/check-design-tokens.mts");
const cli = resolve("node_modules/@google/design.md/dist/index.js");

it("コミットするCSSは固定CLIでDESIGN.mdから生成した出力と一致する", () => {
  const generated = execFileSync(
    process.execPath,
    [cli, "export", "DESIGN.md", "--format", "css-vars", "--prefix", "ib"],
    { encoding: "utf8" },
  );
  expect(readFileSync("app/design-tokens.css", "utf8")).toBe(generated);
});

it("検査は不一致と欠落を拒否し、一致するCSSを変更しない", () => {
  const dir = mkdtempSync(join(tmpdir(), "ib-tokens-"));
  const input = join(dir, "DESIGN.md");
  const output = join(dir, "tokens.css");
  try {
    writeFileSync(input, readFileSync("DESIGN.md"));
    const generated = execFileSync(process.execPath, [
      cli,
      "export",
      input,
      "--format",
      "css-vars",
      "--prefix",
      "ib",
    ]);
    const check = () =>
      spawnSync(process.execPath, [checker, input, output], {
        encoding: "utf8",
      });
    expect(check().status).toBe(1);
    writeFileSync(output, "incorrect");
    expect(check().status).toBe(1);
    expect(readFileSync(output, "utf8")).toBe("incorrect");
    writeFileSync(output, generated);
    expect(check().status).toBe(0);
    expect(readFileSync(output)).toEqual(generated);
    writeFileSync(input, "---\nversion: alpha\ncolors: [\n---\n");
    expect(check().status).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
