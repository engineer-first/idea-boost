// @vitest-environment node
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { manageLocalOutcomesToken } from "./shared-outcomes-token.mts";

it("発行は既存リンクを保持し、置換・削除は他の秘密を保持する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outcomes-token-"));
  const path = join(directory, ".dev.vars");
  try {
    await writeFile(path, "SESSION_SECRET=keep-me\n");
    const first = await manageLocalOutcomesToken(path, "issue");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await manageLocalOutcomesToken(path, "issue")).toBe(first);
    expect(await manageLocalOutcomesToken(path, "rotate")).not.toBe(first);
    await manageLocalOutcomesToken(path, "revoke");
    expect(await readFile(path, "utf8")).toBe("SESSION_SECRET=keep-me\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const execFileAsync = promisify(execFile);
const cli = resolve("scripts/shared-outcomes-token.mts");
const site = "https://example.test";

async function runCli(directory: string, ...args: string[]) {
  return execFileAsync(process.execPath, [cli, ...args], { cwd: directory });
}

function tokenFromOutput(stdout: string): string {
  const url = new URL(stdout.trim());
  expect(url.origin).toBe(site);
  expect(url.pathname).toBe("/shared-outcomes");
  expect(url.search).toBe("");
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  return token as string;
}

it("保存先なしでローカルのURLを出力し、再利用・置換・失効できる", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outcomes-cli-"));
  try {
    const first = await runCli(directory, "issue", "local", site);
    const token = tokenFromOutput(first.stdout);
    const vars = join(directory, "workers", ".dev.vars");
    expect(await readFile(vars, "utf8")).toContain(token);
    expect((await runCli(directory, "issue", "local", site)).stdout).toBe(
      first.stdout,
    );
    const rotated = tokenFromOutput(
      (await runCli(directory, "rotate", "local", site)).stdout,
    );
    expect(rotated).not.toBe(token);
    await runCli(directory, "revoke", "local");
    expect(await readFile(vars, "utf8")).not.toContain(rotated);
    expect(await readdir(directory)).toEqual(["workers"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("検証用URLも保存先なしで出力し、再発行では同じ秘密を使う", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outcomes-cli-"));
  try {
    const first = await runCli(directory, "issue", "verification", site);
    const token = tokenFromOutput(first.stdout);
    expect(
      await readFile(
        join(directory, ".wrangler/verification/outcomes-token"),
        "utf8",
      ),
    ).toBe(token);
    expect(
      (await runCli(directory, "issue", "verification", site)).stdout,
    ).toBe(first.stdout);
    expect(await readdir(directory)).toEqual([".wrangler"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function prepareWrangler(directory: string, exitCode = 0): Promise<void> {
  const bin = join(directory, "node_modules/wrangler/bin");
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, "wrangler.js"),
    `
    const fs = require("node:fs");
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      if (${exitCode} === 0) fs.writeFileSync("registered-secret.json", JSON.stringify({args: process.argv.slice(2), token: input.trim()}));
      console.log("Wrangler progress");
      process.exit(${exitCode});
    });
  `,
  );
}

it("本番の登録成功後に同じ秘密のURLだけを出力し、リンクファイルは作らない", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outcomes-cli-"));
  try {
    await prepareWrangler(directory);
    const result = await runCli(directory, "issue", "production", site);
    const token = tokenFromOutput(result.stdout);
    const registered = JSON.parse(
      await readFile(join(directory, "registered-secret.json"), "utf8"),
    );
    expect(registered).toEqual({
      args: [
        "secret",
        "put",
        "SHARED_OUTCOMES_TOKEN",
        "--config",
        "workers/wrangler.jsonc",
      ],
      token,
    });
    expect(result.stderr).toContain("Wrangler progress");
    expect((await readdir(directory)).sort()).toEqual([
      "node_modules",
      "registered-secret.json",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("本番の登録失敗時は使えないURLを出力しない", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outcomes-cli-"));
  try {
    await prepareWrangler(directory, 1);
    await expect(
      runCli(directory, "issue", "production", site),
    ).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr: expect.stringContaining("Wrangler progress"),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("旧保存先引数や不正URLは設定変更前に拒否する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outcomes-cli-"));
  try {
    for (const args of [
      ["issue", "local", site, "obsolete-link.txt"],
      ["issue", "local", "file:///tmp/link"],
      ["issue", "local"],
    ]) {
      await expect(runCli(directory, ...args)).rejects.toMatchObject({
        code: 1,
        stdout: "",
      });
    }
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
