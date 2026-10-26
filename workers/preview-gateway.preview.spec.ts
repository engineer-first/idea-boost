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
it.each([undefined, "https://another-pr.preview.test"])(
  "WebSocketの別origin/欠落(%s)を拒否する",
  async (origin) => {
    certs();
    const req = request(await jwt(), "/api/rooms/room/ws");
    req.headers.set("Upgrade", "websocket");
    if (origin) req.headers.set("Origin", origin);
    expect((await previewGateway(req, config, next)).status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(config.API_WORKER.fetch).not.toHaveBeenCalled();
  },
);

it.each([45, 75])(
  "本人同期が%s秒遅れてもAccess期限を超えるセッションを発行しない",
  async (delay) => {
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
  },
);

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

const withCookie = (req: Request, cookie: string) => {
  req.headers.set("Cookie", `${req.headers.get("Cookie")}; ${cookie}`);
  return req;
};
const SIGNED_OUT = "__Host-idea_boost_preview_signed_out=1";

it("ログイン済みの/と/loginを/previewへ転送せず、本人セッション付きでアプリへ渡す", async () => {
  certs();
  for (const path of ["/", "/login?next=%2Finvite%2FABC123"]) {
    const res = await previewGateway(request(await jwt(), path), config, next);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cookie: string };
    expect(body.cookie).toMatch(/^idea_boost_session=ey/);
  }
});
it("未ログイン表示への切り替えはAccess認証後だけ受け付け、/へ戻す", async () => {
  certs();
  const denied = await previewGateway(
    request(undefined, "/preview/signed-out"),
    config,
    next,
  );
  expect(denied.status).toBe(401);
  const res = await previewGateway(
    request(await jwt(), "/preview/signed-out"),
    config,
    next,
  );
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toBe("https://pr-123-preview.test/");
  const cookies = res.headers.getSetCookie();
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatch(/^__Host-idea_boost_preview_signed_out=1;/);
  expect(cookies[0]).toContain("Secure");
  expect(cookies[0]).toContain("HttpOnly");
  expect(next).not.toHaveBeenCalled();
});
it.each(["/", "/login?next=%2Finvite%2FABC123", "/about", "/api/rooms"])(
  "未ログイン表示中の%sはCookieを一切渡さず、本人登録もセッション発行もしない",
  async (path) => {
    certs();
    const res = await previewGateway(
      withCookie(request(await jwt(), path), SIGNED_OUT),
      config,
      next,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cookie: string | null };
    expect(body.cookie).toBeNull();
    expect(config.API_WORKER.fetch).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toEqual([]);
  },
);
it("未ログイン表示中もAccess未認証は拒否し、別originの更新操作も拒否する", async () => {
  certs();
  const anonymous = withCookie(request(undefined, "/"), SIGNED_OUT);
  expect((await previewGateway(anonymous, config, next)).status).toBe(401);
  const post = new Request("https://pr-123-preview.test/login", {
    method: "POST",
    headers: {
      "Cf-Access-Jwt-Assertion": await jwt(),
      Cookie: SIGNED_OUT,
      Origin: "https://evil.test",
    },
  });
  expect((await previewGateway(post, config, next)).status).toBe(403);
  expect(next).not.toHaveBeenCalled();
});
it("未ログイン表示中にアプリが発行したセッションCookieをブラウザへ渡さない", async () => {
  certs();
  const issuing = async () =>
    new Response("ok", {
      headers: { "Set-Cookie": "idea_boost_session=forged; Path=/; HttpOnly" },
    });
  const res = await previewGateway(
    withCookie(request(await jwt(), "/login"), SIGNED_OUT),
    config,
    issuing,
  );
  expect(res.headers.getSetCookie()).toEqual([]);
});
it("未ログイン表示中に/previewを開くと表示を解除し、本人セッション付きで渡す", async () => {
  certs();
  const res = await previewGateway(
    withCookie(request(await jwt(), "/preview"), SIGNED_OUT),
    config,
    next,
  );
  const body = (await res.json()) as { cookie: string };
  expect(body.cookie).toMatch(/^idea_boost_session=ey/);
  expect(res.headers.getSetCookie()).toContainEqual(
    expect.stringMatching(
      /^__Host-idea_boost_preview_signed_out=; .*Max-Age=0/,
    ),
  );
});
it("Previewのログイン操作は未ログイン表示を解除し、同じoriginの/loginへnextを渡す", async () => {
  certs();
  const res = await previewGateway(
    withCookie(
      request(await jwt(), "/preview/sign-in?next=%2Finvite%2FABC123%3Fx%3D1"),
      SIGNED_OUT,
    ),
    config,
    next,
  );
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toBe(
    "https://pr-123-preview.test/login?next=%2Finvite%2FABC123%3Fx%3D1",
  );
  expect(res.headers.getSetCookie()).toContainEqual(
    expect.stringMatching(
      /^__Host-idea_boost_preview_signed_out=; .*Max-Age=0/,
    ),
  );
  for (const unsafe of ["https://evil.test", "//evil.test"]) {
    const redirected = await previewGateway(
      request(
        await jwt(),
        `/preview/sign-in?next=${encodeURIComponent(unsafe)}`,
      ),
      config,
      next,
    );
    expect(new URL(redirected.headers.get("Location") ?? "").origin).toBe(
      "https://pr-123-preview.test",
    );
  }
  expect(next).not.toHaveBeenCalled();
});
it.each(["/preview/signed-out", "/preview/sign-in?next=%2F"])(
  "%sはAccess未認証を拒否し、未ログイン表示を変更しない",
  async (path) => {
    certs();
    const res = await previewGateway(request(undefined, path), config, next);
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
  },
);
it.each(["cross-site", "same-site"])(
  "別サイト(Sec-Fetch-Site=%s)から未ログイン表示を切り替えない",
  async (site) => {
    certs();
    for (const path of ["/preview/signed-out", "/preview/sign-in?next=%2F"]) {
      const req = request(await jwt(), path);
      req.headers.set("Sec-Fetch-Site", site);
      const res = await previewGateway(req, config, next);
      expect(res.status).toBe(403);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
  },
);
it("未ログイン表示のCookieはAccessログインの期限までに切れる", async () => {
  certs();
  const res = await previewGateway(
    request(
      await jwt("allowed@example.test", "preview-app", 120),
      "/preview/signed-out",
    ),
    config,
    next,
  );
  const maxAge = Number(
    res.headers.get("Set-Cookie")?.match(/Max-Age=(\d+)/)?.[1],
  );
  expect(maxAge).toBeGreaterThan(0);
  expect(maxAge).toBeLessThanOrEqual(120);
});
it("未ログイン表示中はアプリが発行したCookieを一切ブラウザへ渡さない", async () => {
  certs();
  const issuing = async () => {
    const headers = new Headers();
    headers.append("Set-Cookie", "idea_boost_room_resume=x; Path=/");
    headers.append("Set-Cookie", "future_session=y; Path=/");
    return new Response("ok", { headers });
  };
  const res = await previewGateway(
    withCookie(request(await jwt(), "/login"), SIGNED_OUT),
    config,
    issuing,
  );
  expect(res.headers.getSetCookie()).toEqual([]);
});
it.each([
  [undefined, 403],
  ["https://pr-123-preview.test", 200],
])(
  "未ログイン表示中のWebSocket(Origin=%s)は別originを拒否し、同じoriginはCookieなしで渡す",
  async (origin, status) => {
    certs();
    const req = withCookie(
      request(await jwt(), "/api/rooms/room/ws"),
      SIGNED_OUT,
    );
    req.headers.set("Upgrade", "websocket");
    if (origin) req.headers.set("Origin", origin);
    const res = await previewGateway(req, config, next);
    expect(res.status).toBe(status);
    if (status === 200)
      expect(
        ((await res.json()) as { cookie: string | null }).cookie,
      ).toBeNull();
    else expect(next).not.toHaveBeenCalled();
  },
);
