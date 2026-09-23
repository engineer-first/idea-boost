import type { ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

export async function waitForReady(
  url: string,
  children: ChildProcess[],
  timeoutMs = 120_000,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (children.some(hasExited))
      throw new Error(
        "検証のサーバーが起動中に終了しました。上のログを確認してください。",
      );
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(1000),
        redirect: "manual",
      });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // HTTPで応答するまで待つ。起動したプロセスの終了は上で検出する。
    }
    await delay(250, undefined, { signal });
  }
  throw new Error(`検証の起動が時間内に完了しませんでした: ${url}`);
}

// POSIXでは起動したdetachedプロセスのPIDがグループIDになる。
// 親のexitだけでは子孫の終了を意味しないため、グループ自体を確認する。
function isProcessGroupAlive(child: ChildProcess): boolean {
  if (!child.pid) return false;
  if (process.platform === "win32") return !hasExited(child);
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    // macOSでは終了処理中のグループに対するsignal 0がEPERMを返すことがある。
    // 存在しないとは扱わず、消滅するまで待つ。
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    throw error;
  }
}

function signalProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") {
      if (!hasExited(child)) child.kill(signal);
    } else process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function waitForGroupExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isProcessGroupAlive(child)) {
    if (Date.now() >= deadline) return false;
    await delay(25);
  }
  return true;
}

export async function stopProcesses(children: ChildProcess[]): Promise<void> {
  await Promise.all(
    children.map(async (child) => {
      if (!child.pid) return;
      const exited = hasExited(child)
        ? Promise.resolve()
        : new Promise<void>((resolve) => child.once("exit", () => resolve()));
      signalProcess(child, "SIGTERM");
      // 親が先に終了しても、TERMを無視した子孫が残る間は猶予期限を維持する。
      if (!(await waitForGroupExit(child, 3000))) {
        signalProcess(child, "SIGKILL");
        if (!(await waitForGroupExit(child, 1000)))
          throw new Error("検証のプロセスグループを終了できませんでした。");
      }
      await exited;
    }),
  );
}

export function registerShutdownSignals(abort: AbortController): () => void {
  const onSignal = (): void => {
    if (!abort.signal.aborted) abort.abort();
  };
  // npmや端末から同じ通知が重複しても、清掃完了までは既定の即終了へ戻さない。
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return () => {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  };
}
