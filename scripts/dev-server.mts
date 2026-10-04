// npmの起動元と別のプロセスグループで監視し、互いの終了時も清掃する。
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import {
  registerShutdownSignals,
  stopProcesses,
} from "./verification-process.mts";

const defaultTtlMs = 2 * 60 * 60 * 1000;

type ServerOptions = {
  persistent: boolean;
  ttlMs: number;
  args: string[];
};

function parseOptions(argv: string[]): ServerOptions {
  const separator = argv.indexOf("--");
  if (separator === -1 || !argv[separator + 1])
    throw new Error("起動するNodeスクリプトを -- の後に指定してください。");
  let persistent = false;
  let ttl = process.env.IDEA_BOOST_DEV_TTL_MS ?? String(defaultTtlMs);
  for (let index = 0; index < separator; index++) {
    if (argv[index] === "--persistent") persistent = true;
    else if (argv[index] === "--ttl-ms" && index + 1 < separator)
      ttl = argv[++index];
    else throw new Error(`不明な起動オプション: ${argv[index]}`);
  }
  const ttlMs = Number(ttl);
  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs <= 0 ||
    !Number.isFinite(new Date(Date.now() + ttlMs).getTime())
  )
    throw new Error("停止期限は正の整数のミリ秒で指定してください。");
  return { persistent, ttlMs, args: argv.slice(separator + 1) };
}

async function supervise(options: ServerOptions): Promise<void> {
  if (!process.connected)
    throw new Error("監視プロセスは起動元から起動してください。");
  let stopping = false;
  let parentGone = false;
  let completed = false;
  let forceStop: NodeJS.Timeout | undefined;
  const deadline = Date.now() + options.ttlMs;

  function shutdown(reason: string): void {
    if (stopping) return;
    stopping = true;
    console.log(`[dev-server] ${reason}。サーバーを停止します。`);
    // 自分もグループに含まれる。TERMはこのhandlerで受け、清掃中は生存する。
    forceStop = setTimeout(() => {
      process.kill(-process.pid, "SIGKILL");
    }, 3500);
    process.kill(-process.pid, "SIGTERM");
  }

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.on(signal, () => shutdown("停止要求"));
  process.on("disconnect", () => {
    if (completed) return;
    parentGone = true;
    shutdown("起動元が終了");
  });

  const timer = options.persistent
    ? undefined
    : setInterval(
        () => {
          // 単発のsetTimeoutだけに依存せず、スリープ復帰後も絶対期限を確認する。
          if (Date.now() >= deadline) shutdown("停止期限に到達");
        },
        Math.min(options.ttlMs, 1000),
      );
  console.log(
    options.persistent
      ? "[dev-server] 常駐モード（期限なし）。終了は Ctrl+C。"
      : `[dev-server] 停止期限: ${new Date(deadline).toISOString()}。終了は Ctrl+C。`,
  );

  // 子孫もこの監視プロセスのグループに所属させ、親だけの終了にしない。
  const server = spawn(process.execPath, options.args, {
    stdio: "inherit",
    env: { ...process.env, IDEA_BOOST_DEV_MANAGED: "1" },
  });
  let code = 1;
  try {
    const [exitCode, signal] = (await once(server, "exit")) as [
      number | null,
      NodeJS.Signals | null,
    ];
    code = stopping ? 0 : (exitCode ?? (signal ? 1 : 0));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
  } finally {
    if (timer) clearInterval(timer);
  }
  if (parentGone) {
    // 親がいない場合、主サーバーが先に終了しても強制停止タイマーを残す。
    // TERMを無視する孫プロセスまで、このグループ内で終了させる。
    return;
  }
  if (forceStop) clearTimeout(forceStop);
  process.exitCode = code;
  completed = true;
  // 親はこのexitを受けて、残ったグループを確認・清掃する。
  if (process.connected) process.disconnect();
}

async function launch(options: ServerOptions): Promise<void> {
  const supervisor = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      "--supervise",
      ...(options.persistent ? ["--persistent"] : []),
      "--ttl-ms",
      String(options.ttlMs),
      "--",
      ...options.args,
    ],
    { detached: true, stdio: ["inherit", "inherit", "inherit", "ipc"] },
  );
  const abort = new AbortController();
  const unregister = registerShutdownSignals(abort);
  const onHangup = (): void => abort.abort();
  process.on("SIGHUP", onHangup);
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopping ??= stopProcesses([supervisor]);
    return stopping;
  };
  abort.signal.addEventListener("abort", () => {
    void stop().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
  try {
    const [code] = (await once(supervisor, "exit")) as [number | null];
    process.exitCode = abort.signal.aborted ? 0 : (code ?? 1);
  } finally {
    // 監視側が異常終了しても、起動したグループだけを清掃する。
    await stop();
    unregister();
    process.removeListener("SIGHUP", onHangup);
  }
}

async function main(): Promise<void> {
  if (process.platform === "win32")
    throw new Error(
      "開発サーバーのプロセス管理にはmacOS・Linux・WSLを使ってください。",
    );
  const argv = process.argv.slice(2);
  const isSupervisor = argv[0] === "--supervise";
  const options = parseOptions(isSupervisor ? argv.slice(1) : argv);
  if (isSupervisor) await supervise(options);
  else await launch(options);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
