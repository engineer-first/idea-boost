// @vitest-environment node
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { stopProcesses, waitForReady } from "./verification-process.mts";

describe("検証のプロセス管理", () => {
  it("起動失敗時には準備完了として扱わず、すぐにエラーにする", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(2)"]);
    await once(child, "exit");
    await expect(
      waitForReady("http://127.0.0.1:1", [child], 1000),
    ).rejects.toThrow("終了");
  });

  it("停止時に起動したプロセスを終了させる", async () => {
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { detached: true },
    );
    await once(child, "spawn");
    await stopProcesses([child]);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitForGone(pid: number): Promise<void> {
  const deadline = Date.now() + 2000;
  while (isAlive(pid) && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 25));
  expect(isAlive(pid)).toBe(false);
}

// 子は準備完了をIPCで通知してから切断する。親の終了を確実に待っても、
// タイミング次第で未起動の子を検証してしまわないようにする。
function startParent(exitEarly: boolean) {
  const descendantScript = `process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);`;
  const parentScript = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    child.once('message', () => {
      process.stdout.write(String(child.pid) + '\\n');
      child.disconnect(); child.unref();
      ${exitEarly ? "" : "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);"}
    });
  `;
  return spawn(process.execPath, ["-e", parentScript], {
    detached: true,
    stdio: ["ignore", "pipe", "inherit"],
  });
}

async function cleanupParent(
  parent: ChildProcess,
  exited: Promise<unknown>,
  descendant?: number,
): Promise<void> {
  if (parent.pid) {
    try {
      process.kill(-parent.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  await exited;
  if (descendant) await waitForGone(descendant);
}

it.skipIf(process.platform === "win32").each([true, false])(
  "親が先に終了（%s）してもTERMを無視する子孫まで清掃する",
  async (exitEarly) => {
    const parent = startParent(exitEarly);
    let descendant: number | undefined;
    const exited = once(parent, "exit");
    try {
      const output = await once(parent.stdout, "data");
      descendant = Number(String(output[0]).trim());
      expect(Number.isInteger(descendant) && descendant > 0).toBe(true);
      if (exitEarly) await exited;
      expect(isAlive(descendant)).toBe(true);
      await stopProcesses([parent]);
      await exited;
      await waitForGone(descendant);
    } finally {
      await cleanupParent(parent, exited, descendant);
    }
  },
  10000,
);

async function nextProcessMessage(parent: ChildProcess): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: unknown): void => {
      parent.removeListener("exit", onExit);
      resolve(message);
    };
    const onExit = (code: number | null, signal: string | null): void => {
      parent.removeListener("message", onMessage);
      reject(new Error(`清掃完了前に親が終了しました: ${code ?? signal}`));
    };
    parent.once("message", onMessage);
    parent.once("exit", onExit);
  });
}

async function cleanupDetachedFamily(
  parent: ChildProcess,
  exited: Promise<unknown>,
  descendant?: number,
): Promise<void> {
  if (descendant) {
    try {
      process.kill(-descendant, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  await cleanupParent(parent, exited, descendant);
}

it.skipIf(process.platform === "win32")(
  "清掃中に2回TERMが届いても最後まで子孫を清掃し正常終了する",
  async () => {
    const moduleUrl = new URL("./verification-process.mts", import.meta.url)
      .href;
    const descendantScript =
      "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);";
    const parentScript = `
      import { spawn } from 'node:child_process';
      import { once } from 'node:events';
      import { registerShutdownSignals, stopProcesses } from ${JSON.stringify(moduleUrl)};
      const abort = new AbortController();
      const unregister = registerShutdownSignals(abort);
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      await once(child, 'message');
      child.disconnect();
      process.send({ pid: child.pid });
      await new Promise(resolve => abort.signal.addEventListener('abort', resolve, { once: true }));
      process.send('stopping');
      await stopProcesses([child]);
      process.send('cleaned');
      unregister();
      process.disconnect();
    `;
    const parent = spawn(
      process.execPath,
      ["--input-type=module", "-e", parentScript],
      {
        detached: true,
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      },
    );
    const exited = once(parent, "exit");
    let descendant: number | undefined;
    try {
      const ready = (await nextProcessMessage(parent)) as { pid: number };
      descendant = ready.pid;
      expect(Number.isInteger(descendant) && descendant > 0).toBe(true);
      parent.kill("SIGTERM");
      expect(await nextProcessMessage(parent)).toBe("stopping");
      const cleaned = nextProcessMessage(parent);
      parent.kill("SIGTERM");
      expect(await cleaned).toBe("cleaned");
      expect(await exited).toEqual([0, null]);
      await waitForGone(descendant);
    } finally {
      await cleanupDetachedFamily(parent, exited, descendant);
    }
  },
  10000,
);
