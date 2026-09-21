// 通常の環境ファイル・DBには触れず、ローカル専用構成で検証を起動する。
import { type ChildProcess, spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPortAvailable,
  prepareVerificationRuntime,
  type VerificationRuntime,
} from "./verification-config.mts";
import {
  hasExited,
  registerShutdownSignals,
  stopProcesses,
  waitForReady,
} from "./verification-process.mts";

async function main(): Promise<void> {
  const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
  try {
    await access(join(projectDir, "node_modules/next/dist/bin/next"));
    await access(join(projectDir, "node_modules/wrangler/bin/wrangler.js"));
  } catch {
    throw new Error(
      "依存パッケージがありません。先に npm ci を実行してください。",
    );
  }
  const children: ChildProcess[] = [];
  const abort = new AbortController();
  const unregisterSignals = registerShutdownSignals(abort);
  let runtime: VerificationRuntime | undefined;
  function start(args: string[]): ChildProcess {
    abort.signal.throwIfAborted();
    const child = spawn(process.execPath, args, {
      cwd: projectDir,
      env: runtime?.env,
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
    children.push(child);
    return child;
  }
  async function run(args: string[]): Promise<void> {
    const child = start(args);
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                "検証の初期化に失敗しました。上のログを確認してください。",
              ),
            ),
      );
      abort.signal.addEventListener(
        "abort",
        () => {
          void stopProcesses([child]);
        },
        { once: true },
      );
    });
  }
  try {
    runtime = await prepareVerificationRuntime(projectDir, process.env);
    await Promise.all([
      assertPortAvailable(runtime.appPort),
      assertPortAvailable(runtime.apiPort),
    ]);
    console.log(
      "検証専用データを準備しています（通常の開発データには影響しません）。",
    );
    await run([join(projectDir, "scripts/generate-room-do-migrations.mjs")]);
    await run(runtime.migrateArgs);
    const worker = start(runtime.workerArgs);
    await waitForReady(
      `http://127.0.0.1:${runtime.apiPort}/api/health`,
      [worker],
      120_000,
      abort.signal,
    );
    const next = start(runtime.nextArgs);
    await waitForReady(runtime.readyUrl, [worker, next], 120_000, abort.signal);
    console.log(
      `\n検証を開始: http://localhost:${runtime.appPort}/dev/verify\n終了するには Ctrl+C を押してください。\n`,
    );
    await new Promise<void>((resolve, reject) => {
      abort.signal.addEventListener("abort", () => resolve(), { once: true });
      for (const child of [worker, next]) {
        if (hasExited(child)) {
          reject(new Error("検証のサーバーが終了しました。"));
          break;
        }
        child.once("exit", () =>
          abort.signal.aborted
            ? resolve()
            : reject(
                new Error(
                  "検証のサーバーが終了しました。上のログを確認してください。",
                ),
              ),
        );
        child.once("error", reject);
      }
    });
  } finally {
    await stopProcesses(children);
    if (runtime) await rm(runtime.directory, { recursive: true, force: true });
    unregisterSignals();
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error && error.name === "AbortError") return;
  console.error(
    error instanceof Error ? error.message : "検証の起動に失敗しました。",
  );
  process.exitCode = 1;
});
