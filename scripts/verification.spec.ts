// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPortAvailable,
  prepareVerificationRuntime,
} from "./verification-config.mts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function project(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "idea-verification-test-"));
  directories.push(path);
  return path;
}

describe("検証起動の隔離", () => {
  it("通常の環境ファイルを変えず、ローカルURLと専用保存先で起動する", async () => {
    const path = await project();
    await writeFile(join(path, ".env.local"), "SESSION_SECRET=ordinary-secret");
    const runtime = await prepareVerificationRuntime(path, {
      NODE_ENV: "production",
      API_WORKER_URL: "https://production.example",
      NEXT_PUBLIC_API_WORKER_URL: "https://production.example",
      SESSION_SECRET: "ordinary-secret",
    });
    expect(await readFile(join(path, ".env.local"), "utf8")).toBe(
      "SESSION_SECRET=ordinary-secret",
    );
    expect(runtime.env.API_WORKER_URL).toBe("http://localhost:8787");
    expect(runtime.env.NEXT_PUBLIC_API_WORKER_URL).toBe(
      "http://localhost:8787",
    );
    expect(runtime.env.NODE_ENV).toBe("development");
    expect(runtime.env.IDEA_BOOST_VERIFY).toBe("true");
    expect(runtime.readyUrl).toBe("http://127.0.0.1:3000/login");
    expect(runtime.persistPath).toBe(
      join(path, ".wrangler/verification/state"),
    );
    expect(runtime.migrateArgs).toContain("--local");
    expect(runtime.workerArgs).toContain("--local");
    expect(runtime.migrateArgs).toContain(runtime.persistPath);
    expect(runtime.workerArgs).toContain(runtime.persistPath);
  });

  it("本番DB識別子を使わず、検証専用WorkerとDOをローカルに構成する", async () => {
    const path = await project();
    const runtime = await prepareVerificationRuntime(path, {});
    const config = JSON.parse(await readFile(runtime.configPath, "utf8"));
    expect(config.main).toBe(join(path, "workers/verification-worker.ts"));
    expect(config.durable_objects.bindings).toEqual([
      { name: "ROOM_DO", class_name: "VerificationRoomDO" },
      { name: "VERIFICATION_WORKSPACE", class_name: "VerificationWorkspace" },
    ]);
    expect(config.d1_databases[0].database_id).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(config.dev.ip).toBe("127.0.0.1");
    expect(config.vars).toBeUndefined();
  });

  it("共有鍵を起動ごとに生成し、CLI引数や公開環境変数へ含めない", async () => {
    const runtime = await prepareVerificationRuntime(await project(), {});
    const another = await prepareVerificationRuntime(await project(), {});
    const secret = runtime.env.SESSION_SECRET;
    const token = runtime.env.VERIFICATION_CONTROL_TOKEN;
    expect(secret?.length).toBeGreaterThanOrEqual(32);
    expect(token?.length).toBeGreaterThanOrEqual(32);
    expect(secret).not.toBe(another.env.SESSION_SECRET);
    expect(token).not.toBe(another.env.VERIFICATION_CONTROL_TOKEN);
    const publicSettings = Object.fromEntries(
      Object.entries(runtime.env).filter(([key]) =>
        key.startsWith("NEXT_PUBLIC_"),
      ),
    );
    expect(JSON.stringify(publicSettings)).not.toContain(secret);
    expect(JSON.stringify(runtime.workerArgs)).not.toContain(token);
    const vars = await readFile(join(runtime.directory, ".dev.vars"), "utf8");
    expect(vars).toContain(`SESSION_SECRET=${secret}`);
    expect(vars).toContain(`VERIFICATION_CONTROL_TOKEN=${token}`);
  });

  it("検証用ポートを環境変数で選び、URL・Worker・Next に一貫して渡す", async () => {
    const runtime = await prepareVerificationRuntime(await project(), {
      IDEA_BOOST_VERIFY_APP_PORT: "3100",
      IDEA_BOOST_VERIFY_API_PORT: "8788",
    });
    const config = JSON.parse(await readFile(runtime.configPath, "utf8"));
    expect(runtime.appPort).toBe(3100);
    expect(runtime.apiPort).toBe(8788);
    expect(runtime.readyUrl).toBe("http://127.0.0.1:3100/login");
    expect(runtime.env.API_WORKER_URL).toBe("http://localhost:8788");
    expect(runtime.env.NEXT_PUBLIC_API_WORKER_URL).toBe(
      "http://localhost:8788",
    );
    expect(runtime.env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3100");
    expect(config.dev.port).toBe(8788);
    expect(runtime.workerArgs).toContain("8788");
    expect(runtime.nextArgs).toContain("3100");
  });

  it("既存サーバーのポートを奪わず、停止を案内する", async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("port unavailable");
    try {
      await expect(assertPortAvailable(address.port)).rejects.toThrow("停止");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
