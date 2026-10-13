// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const command = vi.hoisted(() => vi.fn());
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));
vi.mock("node:child_process", () => ({ execFileSync: command }));
vi.mock("wrangler", () => ({
  unstable_readConfig: () => ({ d1_databases: [] }),
}));
vi.mock("./preview-resources.mts", () => ({
  createPreviewResources: () => ({
    prepare: async () => ({
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "idea-boost-preview-pr-587-lobby",
    }),
  }),
}));

import { previewArtifactMigrationHash } from "./preview-bundle.mts";
import { previewProbeToken } from "./preview-secrets.mts";

const sha = "a".repeat(40);
const deployment = {
  preview: { urls: ["https://pr-587.example.workers.dev"] },
  deployment: { urls: ["https://fixed.example.workers.dev"] },
};
let candidate: string;
let argv: string[];

beforeEach(() => {
  vi.resetModules();
  vi.mocked(sleep).mockClear();
  candidate = mkdtempSync(join(tmpdir(), "preview-control-test-"));
  for (const directory of [
    ".preview-bundle",
    ".open-next/assets",
    "workers/migrations",
    "workers/room-do-migrations",
  ])
    mkdirSync(join(candidate, directory), { recursive: true });
  const worker = "export default {fetch(){return new Response('test')}}";
  writeFileSync(join(candidate, ".preview-bundle/worker.js"), worker);
  writeFileSync(
    join(candidate, "workers/migrations/0001_test.sql"),
    "SELECT 1;",
  );
  writeFileSync(
    join(candidate, "workers/room-do-migrations/20261011000000-test.sql"),
    "SELECT 2;",
  );
  writeFileSync(
    join(candidate, ".preview-bundle/manifest.json"),
    JSON.stringify({
      format: 3,
      sha,
      workerSha256: createHash("sha256").update(worker).digest("hex"),
      schemaHash: previewArtifactMigrationHash(candidate),
    }),
  );
  writeFileSync(
    join(candidate, "workers/migrations/0001_test.sql"),
    "SELECT 1;",
  );
  argv = process.argv;
  process.argv = ["node", "preview-control.mts", "publish"];
  for (const [key, value] of Object.entries({
    PREVIEW_PR_NUMBER: "587",
    PREVIEW_APP_SHA: sha,
    PREVIEW_CI_RUN_ID: "123",
    PREVIEW_CI_ATTEMPT: "1",
    PREVIEW_CANDIDATE_DIR: candidate,
    CLOUDFLARE_API_TOKEN: "fake-management-secret",
    CLOUDFLARE_ACCOUNT_ID: "fake-account",
    PREVIEW_SHARED_D1_ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    SESSION_SECRET: "s".repeat(32),
    PREVIEW_PROBE_TOKEN: "p".repeat(32),
    PREVIEW_ALLOWED_EMAILS: "reviewer@example.com",
    PREVIEW_ACCESS_ISSUER: "https://example.cloudflareaccess.com",
    PREVIEW_ACCESS_AUD: "fake-audience",
    PREVIEW_ACCESS_CLIENT_ID: "fake-client.access",
    PREVIEW_ACCESS_CLIENT_SECRET: "fake-client-secret",
  }))
    vi.stubEnv(key, value);
  command.mockImplementation((binary: string, args: string[]) => {
    if (binary !== "gh") return JSON.stringify(deployment);
    const path = args[1];
    if (path.includes("git/trees/"))
      return JSON.stringify({
        truncated: false,
        tree: [
          {
            path: "workers/migrations/0001_test.sql",
            type: "blob",
            mode: "100644",
            sha: createHash("sha1").update("blob 9\0SELECT 1;").digest("hex"),
          },
          {
            path: "workers/room-do-migrations/20261011000000-test.sql",
            type: "blob",
            mode: "100644",
            sha: createHash("sha1").update("blob 9\0SELECT 2;").digest("hex"),
          },
        ],
      });
    if (path.includes("/pulls/"))
      return JSON.stringify({
        number: 587,
        state: "open",
        head: { sha, repo: { full_name: "engineer-first/idea-boost" } },
      });
    if (path.includes("actions/runs"))
      return JSON.stringify({
        workflow_runs: [
          {
            name: "CI",
            id: 123,
            run_attempt: 1,
            status: "completed",
            conclusion: "success",
          },
        ],
      });
    return path.includes("?") ? "[]" : "{}";
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

it("画面素材の進捗メッセージに続くJSONを読み、通常版・固定版を確認できる", async () => {
  const original = command.getMockImplementation();
  command.mockImplementation((binary, args, options) => {
    if (binary === "gh") return original?.(binary, args, options);
    return `🌀 Building list of assets...\n✨ Read 1 file from the assets directory\n🌀 Starting asset upload...\n+ /index.html\nUploaded 1 of 1 assets\n${JSON.stringify(deployment, null, 2)}\n`;
  });
  const fetcher = vi.fn(async () =>
    Response.json({
      ok: true,
      environment: "preview",
      apiCommit: sha,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).resolves.toBeDefined();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([
  "progress fake-client-secret\nnot-json",
  `progress fake-client-secret\n${JSON.stringify(deployment)}\ntrailing junk`,
  'progress fake-client-secret\n{"preview":{"urls":[]},"deployment":{"urls":[]}}',
])("公開結果が不正なら、接続確認へ進まず秘密を含む出力も記録しない: %s", async (output) => {
  const original = command.getMockImplementation();
  command.mockImplementation((binary, args, options) =>
    binary === "gh" ? original?.(binary, args, options) : output,
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher).not.toHaveBeenCalled();
  const logs = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => line)
    .join("\n");
  expect(logs).not.toContain("fake-client-secret");
});

afterEach(() => {
  process.argv = argv;
  rmSync(candidate, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  command.mockReset();
});

it("CIのhealthを名乗るHTTPリクエストで通常版・固定版を確認して成功を報告する", async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    if (headers.get("User-Agent") !== "idea-boost-preview-probe/1.0")
      return new Response("error code: 1010", { status: 403 });
    expect(headers.get("CF-Access-Client-Id")).toBe("fake-client.access");
    expect(headers.get("CF-Access-Client-Secret")).toBe("fake-client-secret");
    expect(headers.get("X-Preview-Probe-Token")).toBe(
      previewProbeToken("p".repeat(32), 587),
    );
    expect(init.redirect).toBe("error");
    return Response.json({ ok: true, environment: "preview", apiCommit: sha });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).resolves.toBeDefined();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "https://pr-587.example.workers.dev/api/health",
    "https://fixed.example.workers.dev/api/health",
  ]);
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  expect(JSON.parse(comments.at(-1)?.[2].input).body).toContain("疎通確認済み");
  const logs = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => JSON.parse(line));
  expect(logs).toContainEqual(
    expect.objectContaining({
      operation: "health",
      state: "succeeded",
      apiCommit: sha,
      expectedSHA: sha,
    }),
  );
});

it("公開直後の500から回復したら通常版・固定版の確認後に成功を報告する", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("temporary failure", { status: 500 }))
    .mockImplementation(async () =>
      Response.json({ ok: true, environment: "preview", apiCommit: sha }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).resolves.toBeDefined();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "https://pr-587.example.workers.dev/api/health",
    "https://pr-587.example.workers.dev/api/health",
    "https://fixed.example.workers.dev/api/health",
  ]);
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  expect(JSON.parse(comments.at(-1)?.[2].input).body).toContain("疎通確認済み");
  expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
  const logs = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => JSON.parse(line));
  expect(logs).toContainEqual(
    expect.objectContaining({
      operation: "health",
      target: "normal",
      state: "retrying",
      attempt: 1,
      httpStatus: 500,
    }),
  );
});

it.each([
  "normal",
  "fixed",
])("%s版が7回の5xx後に回復しても、両URLの版を確認してから成功を報告する", async (target) => {
  const normal = "https://pr-587.example.workers.dev/api/health";
  const fixed = "https://fixed.example.workers.dev/api/health";
  let failures = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url === (target === "normal" ? normal : fixed) && failures < 7) {
      failures++;
      return new Response("temporary failure", { status: 500 });
    }
    return Response.json({ ok: true, environment: "preview", apiCommit: sha });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).resolves.toBeDefined();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
    target === "normal"
      ? [...Array(8).fill(normal), fixed]
      : [normal, ...Array(8).fill(fixed)],
  );
  expect(vi.mocked(sleep).mock.calls.map(([delay]) => delay)).toEqual([
    1000, 2000, 5000, 10000, 20000, 30000, 60000,
  ]);
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  expect(JSON.parse(comments.at(-1)?.[2].input).body).toContain("疎通確認済み");
});

it.each([
  "normal",
  "fixed",
])("%s版のhealthが旧commitを7回返しても、8回目の期待版と両URLを確認してから成功を報告する", async (target) => {
  const normal = "https://pr-587.example.workers.dev/api/health";
  const fixed = "https://fixed.example.workers.dev/api/health";
  const oldSha = "b".repeat(40);
  let outdated = 0;
  const fetcher = vi.fn(async (url: string) => {
    const old = url === (target === "normal" ? normal : fixed) && outdated < 7;
    if (old) outdated++;
    return Response.json({
      ok: true,
      environment: "preview",
      apiCommit: old ? oldSha : sha,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).resolves.toBeDefined();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
    target === "normal"
      ? [...Array(8).fill(normal), fixed]
      : [normal, ...Array(8).fill(fixed)],
  );
  expect(vi.mocked(sleep).mock.calls.map(([delay]) => delay)).toEqual([
    1000, 2000, 5000, 10000, 20000, 30000, 60000,
  ]);
  const logs = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => JSON.parse(line));
  expect(logs.filter((entry) => entry.reason === "version")).toEqual(
    Array.from({ length: 7 }, (_, index) =>
      expect.objectContaining({
        operation: "health",
        target,
        state: "retrying",
        attempt: index + 1,
        reason: "version",
        httpStatus: 200,
        apiCommit: oldSha,
        expectedSHA: sha,
      }),
    ),
  );
  expect(logs).not.toContainEqual(
    expect.objectContaining({ state: "succeeded", apiCommit: oldSha }),
  );
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  expect(JSON.parse(comments.at(-1)?.[2].input).body).toContain("疎通確認済み");
});

it.each([
  { reason: "transport", attempts: 3, delays: [1000, 2000] },
  {
    reason: "http",
    attempts: 8,
    delays: [1000, 2000, 5000, 10000, 20000, 30000, 60000],
  },
])("$reason失敗が続く場合は$attempts回で停止し、成功リンクを出さない", async ({
  reason,
  attempts,
  delays,
}) => {
  const fetcher = vi.fn(async () => {
    if (reason === "transport") throw new Error("fake-client-secret");
    return new Response("fake-client-secret", { status: 503 });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher).toHaveBeenCalledTimes(attempts);
  expect(vi.mocked(sleep).mock.calls.map(([delay]) => delay)).toEqual(delays);
  const output = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => line)
    .join("\n");
  expect(output).not.toContain("fake-client-secret");
  expect(output.split("\n").map((line) => JSON.parse(line))).toContainEqual(
    expect.objectContaining({
      operation: "health",
      state: "failed",
      attempt: attempts,
      reason,
    }),
  );
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  expect(JSON.parse(comments.at(-1)?.[2].input).body).not.toContain(
    "/preview)",
  );
});

it("5xxの待機を延長しても、3回目以降の通信失敗は再試行しない", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("temporary failure", { status: 500 }))
    .mockResolvedValueOnce(new Response("temporary failure", { status: 502 }))
    .mockResolvedValueOnce(new Response("temporary failure", { status: 503 }))
    .mockRejectedValue(new Error("fake-client-secret"));
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(vi.mocked(sleep).mock.calls.map(([delay]) => delay)).toEqual([
    1000, 2000, 5000,
  ]);
});

it.each(
  [
    "PR終了",
    "head変更",
    "別repo",
    "開き直し",
    "CI run変更",
    "CI attempt変更",
    "CI再実行中",
  ].flatMap((change) =>
    ["5xx", "旧commit"].map((response) => ({ change, response })),
  ),
)("$responseの直後に$changeとなったら、待機も再接続もせず成功リンクを出さない", async ({
  change,
  response,
}) => {
  let changed = false;
  const original = command.getMockImplementation();
  command.mockImplementation((binary, args, options) => {
    if (changed && binary === "gh") {
      const path = args[1];
      if (path.includes("/pulls/")) {
        const pr = JSON.parse(original?.(binary, args, options));
        if (change === "PR終了") pr.state = "closed";
        if (change === "head変更") pr.head.sha = "b".repeat(40);
        if (change === "別repo") pr.head.repo.full_name = "other/repository";
        return JSON.stringify(pr);
      }
      if (path.includes("issues/587/events") && change === "開き直し")
        return JSON.stringify([
          { id: 789, event: "reopened", created_at: "2026-10-12T00:00:00Z" },
        ]);
      if (path.includes("actions/runs")) {
        const runs = JSON.parse(original?.(binary, args, options));
        const ci = runs.workflow_runs[0];
        if (change === "CI run変更") ci.id = 124;
        if (change === "CI attempt変更") ci.run_attempt = 2;
        if (change === "CI再実行中") {
          ci.status = "in_progress";
          ci.conclusion = null;
        }
        return JSON.stringify(runs);
      }
    }
    return original?.(binary, args, options);
  });
  const fetcher = vi.fn(async () => {
    changed = true;
    return response === "5xx"
      ? new Response("temporary failure", { status: 500 })
      : Response.json({
          ok: true,
          environment: "preview",
          apiCommit: "b".repeat(40),
        });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  expect(JSON.parse(comments.at(-1)?.[2].input).body).not.toContain(
    "/preview)",
  );
});

it("5xxの待機中にheadが変わったら、待機後の再接続を中止する", async () => {
  let changed = false;
  const original = command.getMockImplementation();
  command.mockImplementation((binary, args, options) => {
    if (changed && binary === "gh" && args[1].includes("/pulls/")) {
      const pr = JSON.parse(original?.(binary, args, options));
      pr.head.sha = "b".repeat(40);
      return JSON.stringify(pr);
    }
    return original?.(binary, args, options);
  });
  vi.mocked(sleep).mockImplementationOnce(async () => {
    changed = true;
  });
  const fetcher = vi.fn(
    async () => new Response("temporary failure", { status: 500 }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
});

it.each([
  400, 401, 403, 404, 429, 200,
])("認証拒否・不正応答は再試行しない: HTTP %i", async (status) => {
  const fetcher = vi.fn(
    async () => new Response("fake-client-secret", { status }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
});

it("通信回復後もAPIの版がPRと違えば成功リンクを出さない", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("temporary failure"))
    .mockImplementation(async () =>
      Response.json({
        ok: true,
        environment: "preview",
        apiCommit: "b".repeat(40),
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher).toHaveBeenCalledTimes(8);
  expect(vi.mocked(sleep).mock.calls.map(([delay]) => delay)).toEqual([
    1000, 2000, 5000, 10000, 20000, 30000, 60000,
  ]);
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  expect(JSON.parse(comments.at(-1)?.[2].input).body).not.toContain(
    "/preview)",
  );
});

it("200でもAPIの版が8回とも違えば失敗し、固定版の確認も成功リンクも出さない", async () => {
  const oldSha = "b".repeat(40);
  const fetcher = vi.fn(async (_url: string) =>
    Response.json({
      ok: true,
      environment: "preview",
      apiCommit: oldSha,
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
    Array(8).fill("https://pr-587.example.workers.dev/api/health"),
  );
  expect(vi.mocked(sleep).mock.calls.map(([delay]) => delay)).toEqual([
    1000, 2000, 5000, 10000, 20000, 30000, 60000,
  ]);
  const logs = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => JSON.parse(line));
  expect(logs).toContainEqual(
    expect.objectContaining({
      operation: "health",
      state: "failed",
      attempt: 8,
      reason: "version",
      httpStatus: 200,
      apiCommit: oldSha,
      expectedSHA: sha,
    }),
  );
  expect(logs).not.toContainEqual(
    expect.objectContaining({ state: "succeeded", apiCommit: oldSha }),
  );
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  expect(JSON.parse(comments.at(-1)?.[2].input).body).not.toContain(
    "/preview)",
  );
});

it.each([
  { ok: false, environment: "preview", apiCommit: sha },
  { ok: true, environment: "production", apiCommit: sha },
  { ok: true, environment: "preview", apiCommit: "fake-client-secret" },
  { ok: true, environment: "preview" },
])("health JSONの形が不正なら、版の回復を待たず秘密も記録しない: %j", async (health) => {
  const fetcher = vi.fn(async () => Response.json(health));
  vi.stubGlobal("fetch", fetcher);
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(sleep).not.toHaveBeenCalled();
  const output = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => line)
    .join("\n");
  expect(output).not.toContain("fake-client-secret");
  expect(output.split("\n").map((line) => JSON.parse(line))).toContainEqual(
    expect.objectContaining({
      operation: "health",
      state: "failed",
      reason: "response",
    }),
  );
});

it("HTTP拒否はstatusとCloudflareの番号を残し、成功リンクを出さない", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("error code: 1010\n", {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        }),
    ),
  );
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  const logs = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => JSON.parse(line));
  expect(logs).toContainEqual(
    expect.objectContaining({
      operation: "health",
      target: "normal",
      state: "failed",
      reason: "http",
      httpStatus: 403,
      cloudflareCode: 1010,
    }),
  );
  const comments = command.mock.calls.filter(([, args]) =>
    args[1]?.endsWith("issues/587/comments"),
  );
  const body = JSON.parse(comments.at(-1)?.[2].input).body;
  expect(body).toContain("更新失敗");
  expect(body).not.toContain("/preview)");
});

it.each([
  "transport",
  "response",
])("%s失敗は種類だけを残し、生エラー・応答に入った秘密を出さない", async (reason) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (reason === "transport") throw new Error("fake-client-secret");
      return new Response("fake-client-secret", { status: 200 });
    }),
  );
  await expect(import("./preview-control.mts")).rejects.toThrow("疎通確認");
  const output = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => line)
    .join("\n");
  expect(output).not.toContain("fake-client-secret");
  const logs = output.split("\n").map((line) => JSON.parse(line));
  expect(logs).toContainEqual(
    expect.objectContaining({
      operation: "health",
      target: "normal",
      state: "failed",
      reason,
    }),
  );
});
