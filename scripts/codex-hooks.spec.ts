// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it("Codexの整形hookは空白のあるworktreeの下位ディレクトリから動く", () => {
  const root = mkdtempSync(join(tmpdir(), "codex hook "));
  roots.push(root);
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "features"));
  writeFileSync(
    join(root, "scripts/format-changed-files.sh"),
    'printf "hook-ran"',
  );
  const config = JSON.parse(readFileSync(".codex/hooks.json", "utf8"));
  const group = config.hooks.PostToolUse.find((entry: { matcher: string }) =>
    new RegExp(entry.matcher).test("Bash"),
  );
  const result = spawnSync("bash", ["-c", group.hooks[0].command], {
    cwd: join(root, "features"),
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("hook-ran");
});
