// @vitest-environment node
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const launcher = new URL("./dev-server.mts", import.meta.url).pathname;
const runs: { process: ChildProcess; directory: string }[] = [];

async function start(options: string[] = [], body?: string) {
  const directory = await mkdtemp(join(tmpdir(), "idea-boost-server-test-"));
  const fixture = join(directory, "server.mjs");
  await writeFile(
    fixture,
    body ??
      `
      import { spawn } from 'node:child_process';
      import { writeFileSync } from 'node:fs';
      const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"]);
      writeFileSync(${JSON.stringify(join(directory, "pids.json"))}, JSON.stringify([process.pid, child.pid]));
      writeFileSync(${JSON.stringify(join(directory, "supervisor.txt"))}, String(process.ppid));
      setInterval(() => {}, 1000);
    `,
  );
  const child = spawn(process.execPath, [launcher, ...options, "--", fixture], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  runs.push({ process: child, directory });
  let output = "";
  child.stdout?.on("data", (data) => {
    output += String(data);
  });
  child.stderr?.on("data", (data) => {
    output += String(data);
  });
  const exited = once(child, "exit");
  return { child, directory, exited, output: () => output };
}

async function pids(directory: string): Promise<number[]> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      return JSON.parse(await readFile(join(directory, "pids.json"), "utf8"));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("サーバーが起動しませんでした");
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function expectGone(ids: number[]): Promise<void> {
  for (let attempt = 0; attempt < 250 && ids.some(alive); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  expect(ids.map(alive)).toEqual(ids.map(() => false));
}

afterEach(async () => {
  for (const run of runs.splice(0)) {
    if (run.process.exitCode === null && run.process.signalCode === null) {
      run.process.kill("SIGTERM");
      await once(run.process, "exit");
    }
    try {
      const ids: number[] = JSON.parse(
        await readFile(join(run.directory, "pids.json"), "utf8"),
      );
      for (const pid of ids) if (alive(pid)) process.kill(pid, "SIGKILL");
    } catch {
      /* 起動前のエラーならPIDファイルはない。 */
    }
    await rm(run.directory, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === "win32")("期限付き開発サーバー", () => {
  it("期限後にTERMを無視する子孫も終了し、別の起動は維持する", async () => {
    const other = await start(["--persistent"]);
    const otherPids = await pids(other.directory);
    const run = await start(["--ttl-ms", "300"]);
    const ids = await pids(run.directory);
    expect(await run.exited).toEqual([0, null]);
    await expectGone(ids);
    expect(otherPids.map(alive)).toEqual([true, true]);
    expect(run.output()).toContain("期限");
  }, 15000);

  it("常駐は期限を超えても動き、手動停止で子孫まで終了する", async () => {
    const run = await start(["--persistent", "--ttl-ms", "150"]);
    const ids = await pids(run.directory);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(ids.map(alive)).toEqual([true, true]);
    run.child.kill("SIGINT");
    expect(await run.exited).toEqual([0, null]);
    await expectGone(ids);
  }, 10000);

  it("起動元が強制終了しても監視側が子孫を片付ける", async () => {
    const run = await start(["--persistent"]);
    const ids = await pids(run.directory);
    run.child.kill("SIGKILL");
    await run.exited;
    await expectGone(ids);
  }, 10000);

  it("起動失敗の終了コードを保持する", async () => {
    const run = await start([], "process.exit(7)");
    expect(await run.exited).toEqual([7, null]);
  });

  it("起動元の出力先が閉じても清掃を続ける", async () => {
    const run = await start(["--persistent"]);
    const ids = await pids(run.directory);
    await new Promise((resolve) => setTimeout(resolve, 200));
    run.child.stdout?.destroy();
    run.child.stderr?.destroy();
    run.child.kill("SIGKILL");
    await run.exited;
    await expectGone(ids);
  }, 10000);

  it("監視プロセスの強制終了時は起動側がグループを片付ける", async () => {
    const run = await start(["--persistent"]);
    const ids = await pids(run.directory);
    const supervisor = Number(
      await readFile(join(run.directory, "supervisor.txt"), "utf8"),
    );
    process.kill(supervisor, "SIGKILL");
    expect(await run.exited).toEqual([1, null]);
    await expectGone(ids);
  }, 10000);

  it("既定では2時間の期限を案内する", async () => {
    const before = Date.now();
    const run = await start();
    await pids(run.directory);
    const deadline = run.output().match(/停止期限: ([^。]+)/)?.[1];
    expect(deadline).toBeDefined();
    const remaining = Date.parse(deadline ?? "") - before;
    expect(remaining).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000);
    expect(remaining).toBeLessThan(2 * 60 * 60 * 1000 + 5000);
  }, 10000);

  it.each([
    "0",
    "-1",
    "NaN",
    "9007199254740991",
  ])("不正な期限 %s では起動しない", async (ttl) => {
    const run = await start(["--ttl-ms", ttl]);
    expect(await run.exited).toEqual([1, null]);
    expect(run.output()).toContain("期限");
  });
});
