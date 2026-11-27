import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readD1Migrations } from "@cloudflare/vitest-plugin";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import englishLandingMessages from "../messages/en/landing.json" with {
  type: "json",
};
import landingMessages from "../messages/ja/landing.json" with { type: "json" };
import { previewProbeToken, previewSessionSecret } from "./preview-secrets.mts";
import type { PreviewBrowserSmokeInput } from "./preview-smoke-browser.mts";

export type PreviewSmokeOptions = {
  // ローカルのテストIdPによる2本人。実Googleアカウント2名の確認とは別。
  browser?: boolean;
  screenshotDirectory?: string;
  runBrowserScenario?: (input: PreviewBrowserSmokeInput) => Promise<void>;
};

function workerFetcher(value: unknown): {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
} {
  if (
    !value ||
    typeof value !== "object" ||
    !("fetch" in value) ||
    typeof value.fetch !== "function"
  )
    throw new Error("MiniflareのWorker入口を確認できません。");
  return { fetch: value.fetch.bind(value) };
}

// 公開するbundleを実際のworkerdで動かす。認証はテスト用IdPで、本物のGoogleログインとは別。
export async function smokePreviewBundle(
  root: string,
  options: PreviewSmokeOptions = {},
): Promise<void> {
  const sha = JSON.parse(
    readFileSync(resolve(root, ".preview-bundle/manifest.json"), "utf8"),
  ).sha as string;
  const issuer = "https://preview-smoke-test.cloudflareaccess.com";
  const master = "preview-smoke-only-master-not-a-real-secret";
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;
  const jwks = {
    keys: [
      {
        ...(await exportJWK(publicKey)),
        kid: "smoke-test-key",
        alg: "RS256",
        use: "sig",
      },
    ],
  };
  // Workerの外向き通信はテストIdPの公開鍵だけに答え、ほかの宛先には出さない。
  const outboundService = async (request: Request): Promise<Response> => {
    if (request.method === "GET" && request.url === certsUrl)
      return Response.json(jwks);
    throw new Error(`Preview smokeは外部へ通信しません: ${request.url}`);
  };
  const identities = [
    { email: "allowed@example.test", sub: "smoke-test-owner" },
    { email: "member@example.test", sub: "smoke-test-member" },
  ] as const;
  const accessTokens = await Promise.all(
    identities.map(({ email, sub }) =>
      new SignJWT({ email })
        .setSubject(sub)
        .setProtectedHeader({ alg: "RS256", kid: "smoke-test-key" })
        .setIssuer(issuer)
        .setAudience("preview-smoke")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey),
    ),
  );
  const [access] = accessTokens;
  const workers = [12, 13].map((number) => ({
    name: `preview-pr-${number}`,
    modules: [
      {
        type: "ESModule" as const,
        path: resolve(root, ".preview-bundle/worker.js"),
      },
    ],
    compatibilityDate: "2026-06-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: `preview-pr-${number}-lobby` },
    durableObjects: {
      ROOM_DO: { className: "PreviewRoomDO", useSQLite: true },
      ACCOUNT_DO: { className: "PreviewAccountDO", useSQLite: true },
    },
    assets: {
      directory: resolve(root, ".open-next/assets"),
      binding: "ASSETS",
      routerConfig: {
        has_user_worker: true,
        invoke_user_worker_ahead_of_assets: true,
      },
    },
    outboundService,
    bindings: {
      PREVIEW_ENABLED: "true",
      PREVIEW_ACCESS_ISSUER: issuer,
      PREVIEW_ACCESS_AUD: "preview-smoke",
      PREVIEW_ALLOWED_EMAILS: identities.map(({ email }) => email).join(","),
      SESSION_SECRET: previewSessionSecret(
        master,
        number,
        `000000${number}-0000-4000-8000-0000000000${number}`,
      ),
      PREVIEW_PROBE_TOKEN: previewProbeToken(master, number),
      PREVIEW_API_COMMIT: sha,
    },
  }));
  const mf = new Miniflare(
    convertV4MiniflareOptions({ workers, https: options.browser === true }),
  );
  // 一時サーバーは標準2時間で停止。通常はfinallyで検証直後に停止する。
  const deadline = setTimeout(() => void mf.dispose(), 7_200_000);
  deadline.unref();
  try {
    const migrations = await readD1Migrations(
      resolve(root, "workers/migrations"),
    );
    for (const number of [12, 13]) {
      const db = await mf.getD1Database("DB", `preview-pr-${number}`);
      for (const migration of migrations)
        await db.batch(migration.queries.map((sql) => db.prepare(sql)));
    }
    const a = workerFetcher(await mf.getWorker("preview-pr-12"));
    const b = workerFetcher(await mf.getWorker("preview-pr-13"));
    const origin = (await mf.ready).origin;
    const health = await a.fetch(`${origin}/api/health`, {
      headers: { "X-Preview-Probe-Token": previewProbeToken(master, 12) },
    });
    assert.equal(health.status, 200);
    assert.equal(
      ((await health.json()) as { apiCommit: string }).apiCommit,
      sha,
    );
    const anonymous = await a.fetch(`${origin}/preview`);
    assert.equal(anonymous.status, 401);
    const headers = { "Cf-Access-Jwt-Assertion": access, Origin: origin };
    const created = await a.fetch(`${origin}/api/preview/rooms`, {
      method: "POST",
      headers,
      body: JSON.stringify({ checkpoint: "1-1" }),
    });
    if (created.status !== 201)
      throw new Error(
        `Preview sample creation failed: ${created.status} ${await created.text()}`,
      );
    const room = (await created.json()) as { roomId: string };
    const foreign = await b.fetch(`${origin}/api/rooms/${room.roomId}`, {
      headers,
    });
    assert.equal(foreign.status, 404);
    const roomPage = await a.fetch(`${origin}/preview`, { headers });
    assert.equal(roomPage.status, 200);
    assert.match(await roomPage.text(), /確認するステップを選ぶ/);
    // LPは本人のままの/と、未ログイン表示の/・/loginの両方で確認できる。
    const signedIn = await a.fetch(`${origin}/`, {
      headers,
      redirect: "manual",
    });
    assert.equal(signedIn.status, 307);
    assert.equal(
      new URL(signedIn.headers.get("Location") ?? "", origin).pathname,
      "/home",
    );
    const signedOutEntry = await a.fetch(`${origin}/preview/signed-out`, {
      headers,
      redirect: "manual",
    });
    assert.equal(signedOutEntry.status, 302);
    const signedOutCookie = signedOutEntry.headers
      .get("Set-Cookie")
      ?.split(";")[0];
    assert.ok(signedOutCookie);
    // 言語を送らない検索エンジン・SNS の取得には日本語の LP を返す。
    const landing = await a.fetch(`${origin}/`, {
      headers: { ...headers, Cookie: signedOutCookie },
      redirect: "manual",
    });
    assert.equal(landing.status, 200);
    const landingHtml = await landing.text();
    assert.ok(landingHtml.includes(landingMessages.landingCopy.cta.normal[0]));
    assert.match(
      landingHtml,
      /hreflang="en" href="https:\/\/ideaboost\.dev\/en"/i,
    );
    const englishLanding = await a.fetch(`${origin}/en`, {
      headers: { ...headers, Cookie: signedOutCookie },
      redirect: "manual",
    });
    assert.equal(englishLanding.status, 200);
    const englishHtml = await englishLanding.text();
    assert.ok(
      englishHtml.includes(englishLandingMessages.landingCopy.cta.normal[0]),
    );
    assert.match(englishHtml, /<main lang="en"/);
    const login = await a.fetch(`${origin}/login?next=%2Fhome`, {
      headers: { ...headers, Cookie: signedOutCookie },
      redirect: "manual",
    });
    assert.equal(login.status, 200);
    assert.match(await login.text(), /IdeaBoostとは？/);
    const otherDb = await mf.getD1Database("DB", "preview-pr-13");
    assert.equal(
      (
        await otherDb
          .prepare("SELECT COUNT(*) AS count FROM rooms")
          .first<{ count: number }>()
      )?.count,
      0,
    );
    if (options.browser) {
      const runBrowserScenario =
        options.runBrowserScenario ??
        (await import("./preview-smoke-browser.mts"))
          .smokePreviewBrowserCollaboration;
      await runBrowserScenario({
        origin,
        accessTokens: [accessTokens[0], accessTokens[1]],
        screenshotDirectory: options.screenshotDirectory,
      });
    }
    console.log(
      JSON.stringify({
        test: "compiled-preview-smoke",
        state: "succeeded",
        checks: [
          "App/API/DO health",
          "anonymous rejected",
          "sample room created",
          "other PR cannot access",
          "Next page rendered",
          "landing signed in and signed out",
          ...(options.browser
            ? ["two test identities; real UI/WebSocket"]
            : []),
        ],
        authentication: "local test IdP; not two real Google accounts",
      }),
    );
  } finally {
    clearTimeout(deadline);
    await mf.dispose();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await smokePreviewBundle(process.cwd(), {
    browser: process.argv.includes("--browser"),
    screenshotDirectory: process.env.PREVIEW_BROWSER_SCREENSHOT_DIR,
  });
