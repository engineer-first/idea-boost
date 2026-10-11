// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const command = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFileSync: command }));
vi.mock("wrangler", () => ({ unstable_readConfig: vi.fn() }));
const sha = "a".repeat(40);
let candidate: string;
let argv: string[];

beforeEach(() => {
  vi.resetModules();
  candidate = mkdtempSync(join(tmpdir(), "preview-control-test-"));
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
    if (binary !== "gh")
      return JSON.stringify({
        preview: { urls: ["https://pr-587.example.workers.dev"] },
        deployment: { urls: ["https://fixed.example.workers.dev"] },
      });
    const path = args[1];
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
    expect(headers.get("X-Preview-Probe-Token")).toBe("p".repeat(32));
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
  expect(body).not.toContain("[ステップを選んで開く]");
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
