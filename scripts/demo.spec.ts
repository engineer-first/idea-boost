// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertPortAvailable, prepareDemoRuntime } from "./demo-config.mts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function project(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "idea-demo-test-"));
  directories.push(path);
  return path;
}

describe("デモ起動の隔離", () => {
  it("通常の環境ファイルを変えず、ローカルURLと専用保存先で起動する", async () => {
    const path = await project();
    await writeFile(join(path, ".env.local"), "SESSION_SECRET=ordinary-secret");
    const runtime = await prepareDemoRuntime(path, {
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
    expect(runtime.env.IDEA_BOOST_DEMO).toBe("true");
    expect(runtime.persistPath).toBe(join(path, ".wrangler/demo/state"));
    expect(runtime.migrateArgs).toContain("--local");
    expect(runtime.workerArgs).toContain("--local");
    expect(runtime.migrateArgs).toContain(runtime.persistPath);
    expect(runtime.workerArgs).toContain(runtime.persistPath);
  });

  it("本番DB識別子を使わず、デモ専用WorkerとDOをローカルに構成する", async () => {
    const path = await project();
    const runtime = await prepareDemoRuntime(path, {});
    const config = JSON.parse(await readFile(runtime.configPath, "utf8"));
    expect(config.main).toBe(join(path, "workers/demo-worker.ts"));
    expect(config.durable_objects.bindings).toEqual([
      { name: "ROOM_DO", class_name: "DemoRoomDO" },
    ]);
    expect(config.d1_databases[0].database_id).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(config.dev.ip).toBe("127.0.0.1");
    expect(config.vars).toBeUndefined();
  });

  it("共有鍵を起動ごとに生成し、CLI引数や公開環境変数へ含めない", async () => {
    const runtime = await prepareDemoRuntime(await project(), {});
    const another = await prepareDemoRuntime(await project(), {});
    const secret = runtime.env.SESSION_SECRET;
    const token = runtime.env.DEMO_CONTROL_TOKEN;
    expect(secret?.length).toBeGreaterThanOrEqual(32);
    expect(token?.length).toBeGreaterThanOrEqual(32);
    expect(secret).not.toBe(another.env.SESSION_SECRET);
    expect(token).not.toBe(another.env.DEMO_CONTROL_TOKEN);
    const publicSettings = Object.fromEntries(
      Object.entries(runtime.env).filter(([key]) =>
        key.startsWith("NEXT_PUBLIC_"),
      ),
    );
    expect(JSON.stringify(publicSettings)).not.toContain(secret);
    expect(JSON.stringify(runtime.workerArgs)).not.toContain(token);
    const vars = await readFile(join(runtime.directory, ".dev.vars"), "utf8");
    expect(vars).toContain(`SESSION_SECRET=${secret}`);
    expect(vars).toContain(`DEMO_CONTROL_TOKEN=${token}`);
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
