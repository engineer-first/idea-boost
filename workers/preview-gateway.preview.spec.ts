import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, expect, it, vi } from "vitest";
import { previewGateway } from "./preview-gateway";

const issuer = "https://test-team.cloudflareaccess.com";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(publicKey)),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
const config = {
  PREVIEW_ENABLED: "true",
  PREVIEW_ACCESS_ISSUER: issuer,
  PREVIEW_ACCESS_AUD: "preview-app",
  PREVIEW_ALLOWED_EMAILS: "allowed@example.test",
  SESSION_SECRET: "preview-test-secret-at-least-32-characters",
  API_WORKER: {
    fetch: vi.fn(async () =>
      Response.json({ userId: "b1000000-0000-4000-8000-000000000001" }),
    ),
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function jwt(
  email = "allowed@example.test",
  aud = "preview-app",
  exp = 60,
  iss = issuer,
) {
  return new SignJWT({ email })
    .setSubject("access-sub")
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + exp)
    .sign(privateKey);
}
function certs() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
}
const request = (token?: string, path = "/api/rooms") =>
  new Request(`https://pr-123-preview.test${path}`, {
    headers: token
      ? {
          "Cf-Access-Jwt-Assertion": token,
          Cookie: "idea_boost_session=production-cookie",
        }
      : {},
  });
const next = vi.fn(async (req: Request) =>
  Response.json({
    cookie: req.headers.get("Cookie"),
    origin: req.headers.get("X-Idea-Boost-Preview-Origin"),
  }),
);

it("未認証・偽造ヘッダー・期限切れ・宛先/発行元違い・許可外を拒否する", async () => {
  certs();
  for (const token of [
    undefined,
    "forged",
    await jwt("allowed@example.test", "other"),
    await jwt("allowed@example.test", "preview-app", -60),
    await jwt("denied@example.test"),
    await jwt(
      "allowed@example.test",
      "preview-app",
      60,
      "https://other.cloudflareaccess.com",
    ),
  ]) {
    const res = await previewGateway(request(token), config, next);
    expect(res.status).toBe(401);
  }
  expect(next).not.toHaveBeenCalled();
  expect(config.API_WORKER.fetch).not.toHaveBeenCalled();
});
it("設定不足で拒否し、本番Cookieを本人セッションとして転送しない", async () => {
  certs();
  expect(
    (
      await previewGateway(
        request(await jwt()),
        { ...config, PREVIEW_ACCESS_AUD: undefined },
        next,
      )
    ).status,
  ).toBe(503);
  const res = await previewGateway(
    request(await jwt(), "/preview"),
    config,
    next,
  );
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { cookie: string; origin: string };
  expect(body.cookie).not.toContain("production-cookie");
  expect(body.origin).toBe("https://pr-123-preview.test");
  expect(res.headers.get("Set-Cookie")).toContain(
    "__Host-idea_boost_preview_session=",
  );
  expect(res.headers.get("Set-Cookie")).toContain("Secure");
  expect(res.headers.get("Set-Cookie")).toContain("HttpOnly");
});
it.each([
  undefined,
  "https://another-pr.preview.test",
])("WebSocketの別origin/欠落(%s)を拒否する", async (origin) => {
  certs();
  const req = request(await jwt(), "/api/rooms/room/ws");
  req.headers.set("Upgrade", "websocket");
  if (origin) req.headers.set("Origin", origin);
  expect((await previewGateway(req, config, next)).status).toBe(403);
  expect(next).not.toHaveBeenCalled();
  expect(config.API_WORKER.fetch).not.toHaveBeenCalled();
});

it.each([
  45, 75,
])("本人同期が%s秒遅れてもAccess期限を超えるセッションを発行しない", async (delay) => {
  certs();
  const access = await jwt();
  const now = Date.now();
  let clock: ReturnType<typeof vi.spyOn> | undefined;
  config.API_WORKER.fetch.mockImplementationOnce(async () => {
    clock = vi.spyOn(Date, "now").mockReturnValue(now + delay * 1000);
    return Response.json({ userId: "b1000000-0000-4000-8000-000000000001" });
  });
  try {
    const response = await previewGateway(
      request(access, "/preview"),
      config,
      next,
    );
    if (delay > 60) {
      expect(response.status).toBe(401);
      expect(next).not.toHaveBeenCalled();
    } else {
      const token = response.headers
        .get("Set-Cookie")
        ?.split("=")[1]
        .split(";")[0];
      expect(token).toBeTruthy();
      expect(Number(decodeJwt(token ?? "").exp)).toBeLessThanOrEqual(
        Number(decodeJwt(access).exp),
      );
    }
  } finally {
    clock?.mockRestore();
  }
});

it("ログアウト時のPreview CookieをSecure付きで削除し、自動再発行しない", async () => {
  certs();
  const logout = async () =>
    new Response(null, {
      status: 303,
      headers: {
        Location: "/cdn-cgi/access/logout",
        "Set-Cookie":
          "idea_boost_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      },
    });
  const response = await previewGateway(
    request(await jwt(), "/home"),
    config,
    logout,
  );
  const cookies = response.headers.getSetCookie();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toContain("__Host-idea_boost_preview_session=;");
  expect(cookies[0]).toContain("Secure");
});
