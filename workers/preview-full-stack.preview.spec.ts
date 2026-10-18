import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, expect, it, vi } from "vitest";
import { createFullStackPreview } from "./preview-full-stack";

const sha = "a".repeat(40);
const config = () => ({
  ...env,
  PREVIEW_ENABLED: "true",
  PREVIEW_ALLOWED_EMAILS: "allowed@example.test",
  PREVIEW_ACCESS_ISSUER: "https://full-stack-test.cloudflareaccess.com",
  PREVIEW_ACCESS_AUD: "full-stack-preview",
  PREVIEW_PROBE_TOKEN: "test-only-probe-token-at-least-32-characters",
  PREVIEW_API_COMMIT: sha,
});
afterEach(() => vi.unstubAllGlobals());

it("設定欠落・未認証はNextや外部APIに進めず拒否する", async () => {
  const next = { fetch: vi.fn(async () => Response.json({})) };
  const worker = createFullStackPreview(next);
  const request = new Request("https://pr-587.preview.test/preview");
  expect(
    (await worker.fetch(request, config(), createExecutionContext())).status,
  ).toBe(401);
  expect(
    (
      await worker.fetch(
        request,
        { ...config(), PREVIEW_ENABLED: undefined },
        createExecutionContext(),
      )
    ).status,
  ).toBe(503);
  expect(next.fetch).not.toHaveBeenCalled();
});
it("疎通確認は共通APIへfallbackせず、同梱したAPIと実D1・DOを使う", async () => {
  const external = vi.fn(async () =>
    Response.json({ apiCommit: "b".repeat(40) }),
  );
  const next = { fetch: vi.fn(async () => Response.json({})) };
  const settings = { ...config(), API_WORKER: { fetch: external } };
  const response = await createFullStackPreview(next).fetch(
    new Request("https://pr-587.preview.test/api/health", {
      headers: { "X-Preview-Probe-Token": settings.PREVIEW_PROBE_TOKEN },
    }),
    settings,
    createExecutionContext(),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    ok: true,
    environment: "preview",
    apiCommit: sha,
  });
  expect(external).not.toHaveBeenCalled();
  expect(next.fetch).not.toHaveBeenCalled();
});
it("本人同期からNextのAPI呼出しまで同じPRのAPIとD1を使う", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const settings = config();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        keys: [
          {
            ...(await exportJWK(publicKey)),
            kid: "full-stack-test-key",
            alg: "RS256",
            use: "sig",
          },
        ],
      }),
    ),
  );
  const token = await new SignJWT({ email: "allowed@example.test" })
    .setSubject("full-stack-test-user")
    .setProtectedHeader({ alg: "RS256", kid: "full-stack-test-key" })
    .setIssuer(settings.PREVIEW_ACCESS_ISSUER)
    .setAudience(settings.PREVIEW_ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
  const next = {
    fetch: vi.fn(
      async (
        request: Request,
        runtimeEnv: Parameters<
          Parameters<typeof createFullStackPreview>[0]["fetch"]
        >[1],
      ) =>
        runtimeEnv.API_WORKER.fetch(
          new Request("https://preview-api.internal/api/health", {
            headers: request.headers,
          }),
        ),
    ),
  };
  const response = await createFullStackPreview(next).fetch(
    new Request("https://pr-587.preview.test/preview", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    }),
    settings,
    createExecutionContext(),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ apiCommit: sha });
  expect(next.fetch).toHaveBeenCalledOnce();
  expect(
    await env.DB.prepare("SELECT email FROM users WHERE email=?")
      .bind("allowed@example.test")
      .first(),
  ).toMatchObject({ email: "allowed@example.test" });
});
