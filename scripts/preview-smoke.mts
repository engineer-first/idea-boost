import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createFetchMock, Miniflare } from "miniflare";
import { previewProbeToken, previewSessionSecret } from "./preview-secrets.mts";

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
export async function smokePreviewBundle(root: string): Promise<void> {
  const sha = JSON.parse(
    readFileSync(resolve(root, ".preview-bundle/manifest.json"), "utf8"),
  ).sha as string;
  const issuer = "https://preview-smoke-test.cloudflareaccess.com";
  const master = "preview-smoke-only-master-not-a-real-secret";
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const mock = createFetchMock();
  mock.disableNetConnect();
  mock
    .get(issuer)
    .intercept({ path: "/cdn-cgi/access/certs" })
    .reply(200, {
      keys: [
        {
          ...(await exportJWK(publicKey)),
          kid: "smoke-test-key",
          alg: "RS256",
          use: "sig",
        },
      ],
    })
    .persist();
  const access = await new SignJWT({ email: "allowed@example.test" })
    .setSubject("smoke-test-user")
    .setProtectedHeader({ alg: "RS256", kid: "smoke-test-key" })
    .setIssuer(issuer)
    .setAudience("preview-smoke")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
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
    },
    assets: {
      directory: resolve(root, ".open-next/assets"),
      binding: "ASSETS",
      routerConfig: {
        has_user_worker: true,
        invoke_user_worker_ahead_of_assets: true,
      },
    },
    fetchMock: mock,
    bindings: {
      PREVIEW_ENABLED: "true",
      PREVIEW_ACCESS_ISSUER: issuer,
      PREVIEW_ACCESS_AUD: "preview-smoke",
      PREVIEW_ALLOWED_EMAILS: "allowed@example.test",
      SESSION_SECRET: previewSessionSecret(
        master,
        number,
        `000000${number}-0000-4000-8000-0000000000${number}`,
      ),
      PREVIEW_PROBE_TOKEN: previewProbeToken(master, number),
      PREVIEW_API_COMMIT: sha,
    },
  }));
  const mf = new Miniflare({ workers });
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
    const otherDb = await mf.getD1Database("DB", "preview-pr-13");
    assert.equal(
      (
        await otherDb
          .prepare("SELECT COUNT(*) AS count FROM rooms")
          .first<{ count: number }>()
      )?.count,
      0,
    );
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
        ],
        authentication: "test IdP; not real Google",
      }),
    );
  } finally {
    await mf.dispose();
    await mock.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await smokePreviewBundle(process.cwd());
