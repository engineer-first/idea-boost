import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

export type VerificationRuntime = {
  directory: string;
  readyUrl: string;
  configPath: string;
  persistPath: string;
  env: NodeJS.ProcessEnv;
  migrateArgs: string[];
  workerArgs: string[];
  nextArgs: string[];
};

export async function assertPortAvailable(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", () =>
      reject(
        new Error(
          `ポート ${port} を使用中です。通常の開発サーバーを停止してから再実行してください。`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
}

export async function prepareVerificationRuntime(
  projectDir: string,
  inheritedEnv: NodeJS.ProcessEnv,
): Promise<VerificationRuntime> {
  const verificationDir = join(projectDir, ".wrangler/verification");
  await mkdir(verificationDir, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(verificationDir, "runtime-"));
  const configPath = join(directory, "wrangler.json");
  const persistPath = join(verificationDir, "state");
  const secret = randomBytes(32).toString("hex");
  const token = randomBytes(32).toString("hex");
  const config = {
    name: "idea-flow-verification",
    main: join(projectDir, "workers/verification-worker.ts"),
    compatibility_date: "2026-06-01",
    compatibility_flags: ["nodejs_compat"],
    dev: { ip: "127.0.0.1", port: 8787 },
    durable_objects: {
      bindings: [
        { name: "ROOM_DO", class_name: "VerificationRoomDO" },
        { name: "VERIFICATION_WORKSPACE", class_name: "VerificationWorkspace" },
      ],
    },
    migrations: [
      {
        tag: "v1",
        new_sqlite_classes: ["VerificationRoomDO", "VerificationWorkspace"],
      },
    ],
    d1_databases: [
      {
        binding: "DB",
        database_name: "idea-flow-verification",
        database_id: "00000000-0000-0000-0000-000000000000",
        migrations_dir: join(projectDir, "workers/migrations"),
      },
    ],
  };
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  await writeFile(
    join(directory, ".dev.vars"),
    `SESSION_SECRET=${secret}\nVERIFICATION_CONTROL_TOKEN=${token}\nIDEA_BOOST_VERIFY=true\n`,
    { mode: 0o600 },
  );
  const env: NodeJS.ProcessEnv = {
    ...inheritedEnv,
    NODE_ENV: "development",
    IDEA_BOOST_VERIFY: "true",
    VERIFICATION_CONTROL_TOKEN: token,
    SESSION_SECRET: secret,
    API_WORKER_URL: "http://localhost:8787",
    NEXT_PUBLIC_API_WORKER_URL: "http://localhost:8787",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_ENABLE_DEV_AUTH: "true",
    NEXT_PUBLIC_USE_MSW: "false",
    NEXT_TELEMETRY_DISABLED: "1",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING: "",
    CI: "true",
  };
  const wrangler = join(projectDir, "node_modules/wrangler/bin/wrangler.js");
  return {
    directory,
    readyUrl: "http://127.0.0.1:3000/login",
    configPath,
    persistPath,
    env,
    migrateArgs: [
      wrangler,
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      persistPath,
    ],
    workerArgs: [
      wrangler,
      "dev",
      "--local",
      "--config",
      configPath,
      "--persist-to",
      persistPath,
      "--ip",
      "127.0.0.1",
      "--port",
      "8787",
      "--inspector-port",
      "0",
      "--show-interactive-dev-session=false",
    ],
    nextArgs: [
      join(projectDir, "node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
  };
}
