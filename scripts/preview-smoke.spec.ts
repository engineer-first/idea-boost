// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeJwt } from "jose";
import { afterEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  dispose: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  options: vi.fn(),
}));
vi.mock("@cloudflare/vitest-plugin", () => ({
  readD1Migrations: async () => [],
}));
vi.mock("miniflare", () => ({
  createFetchMock: () => ({
    disableNetConnect() {},
    get: () => ({
      intercept: () => ({ reply: () => ({ persist() {} }) }),
    }),
    close: runtime.close,
  }),
  Miniflare: class {
    ready = Promise.resolve(new URL("https://127.0.0.1:44321"));
    constructor(options: unknown) {
      runtime.options(options);
    }
    dispose = runtime.dispose;
    async getD1Database() {
      return { prepare: () => ({ first: async () => ({ count: 0 }) }) };
    }
    async getWorker(name: string) {
      return {
        fetch: async (url: string, init?: RequestInit) => {
          const path = new URL(url).pathname;
          if (path === "/api/health")
            return Response.json({ apiCommit: "a".repeat(40) });
          if (path === "/api/preview/rooms")
            return Response.json({ roomId: "local-room" }, { status: 201 });
          if (name === "preview-pr-13")
            return new Response(null, { status: 404 });
          if (path === "/preview/signed-out")
            return new Response(null, {
              status: 302,
              headers: { "Set-Cookie": "signed-out=1; Path=/" },
            });
          const cookie = new Headers(init?.headers).get("Cookie");
          if (path === "/" && !cookie)
            return new Response(null, {
              status: 307,
              headers: { Location: "/home" },
            });
          if (path === "/") return new Response("無料で始める");
          if (path === "/login") return new Response("IdeaBoostとは？");
          return init?.headers
            ? new Response("確認するステップを選ぶ")
            : new Response(null, { status: 401 });
        },
      };
    }
  },
}));

import { smokePreviewBundle } from "./preview-smoke.mts";

const directories: string[] = [];
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "preview-smoke-test-"));
  directories.push(root);
  mkdirSync(join(root, ".preview-bundle"));
  writeFileSync(
    join(root, ".preview-bundle/manifest.json"),
    JSON.stringify({ sha: "a".repeat(40) }),
  );
  return root;
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});

it("UI検証では別々の本人証明を持つ2ブラウザへ、実bundleの同じローカルHTTPS入口を渡す", async () => {
  const scenario = vi.fn(async () => {});
  await smokePreviewBundle(fixture(), {
    browser: true,
    runBrowserScenario: scenario,
  });
  expect(scenario).toHaveBeenCalledOnce();
  const [input] = scenario.mock.calls[0] as unknown as [
    { origin: string; accessTokens: readonly [string, string] },
  ];
  expect(input.origin).toBe("https://127.0.0.1:44321");
  const claims = input.accessTokens.map((token) => decodeJwt(token));
  expect(new Set(claims.map((claim) => claim.sub)).size).toBe(2);
  expect(new Set(claims.map((claim) => claim.email)).size).toBe(2);
  expect(
    claims.every(
      (claim) =>
        claim.iss === "https://preview-smoke-test.cloudflareaccess.com",
    ),
  ).toBe(true);
  expect(runtime.options.mock.calls[0][0]).toMatchObject({ https: true });
});

it("UI検証が失敗してもMiniflareとテストIdPを停止し、成功扱いにしない", async () => {
  const failure = new Error("参加者へ私有付箋が届きました");
  await expect(
    smokePreviewBundle(fixture(), {
      browser: true,
      runBrowserScenario: async () => {
        throw failure;
      },
    }),
  ).rejects.toThrow(failure.message);
  expect(runtime.dispose).toHaveBeenCalledOnce();
  expect(runtime.close).toHaveBeenCalledOnce();
});
