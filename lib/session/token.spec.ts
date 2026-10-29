// @vitest-environment node
// jose は Web Crypto を使う純ロジックのため node 環境で実行する。
// jsdom 環境では realm を跨いだ Uint8Array の instanceof 判定に失敗する。
import { describe, expect, it } from "vitest";
import {
  SessionPayloadSchema,
  TOKEN_AUDIENCE,
  VerifiedSessionSchema,
} from "@/contracts/session";
import { signToken, verifyToken } from "@/lib/session/token";

const SECRET = "test-secret-at-least-32-characters-long!!";
const PAYLOAD = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  name: "Owner",
};

function sign(overrides?: Partial<Parameters<typeof signToken>[1]>) {
  return signToken(PAYLOAD, {
    secret: SECRET,
    audience: TOKEN_AUDIENCE.session,
    expiresInSeconds: 60,
    ...overrides,
  });
}

describe("signToken / verifyToken", () => {
  it("kindを含まない署名済みトークンを検証するとaccountに正規化したペイロードが取り出せる", async () => {
    const token = await sign();
    const verified = await verifyToken(token, SessionPayloadSchema, {
      secret: SECRET,
      audience: TOKEN_AUDIENCE.session,
    });
    expect(verified).toEqual({ ...PAYLOAD, kind: "account" });
  });

  it("改ざんされたトークンは null になる", async () => {
    const token = await sign();
    const [h, p, s] = token.split(".");
    const tamperedPayload = `${p?.slice(0, -2)}xx`;
    const verified = await verifyToken(
      `${h}.${tamperedPayload}.${s}`,
      SessionPayloadSchema,
      { secret: SECRET, audience: TOKEN_AUDIENCE.session },
    );
    expect(verified).toBeNull();
  });

  it("異なる秘密鍵で署名されたトークンは null になる", async () => {
    const token = await sign({
      secret: "another-secret-32-characters-long!!!!!",
    });
    const verified = await verifyToken(token, SessionPayloadSchema, {
      secret: SECRET,
      audience: TOKEN_AUDIENCE.session,
    });
    expect(verified).toBeNull();
  });

  it("audience が異なるトークンは null になる（用途の流用防止）", async () => {
    const token = await sign({ audience: TOKEN_AUDIENCE.loginAssertion });
    const verified = await verifyToken(token, SessionPayloadSchema, {
      secret: SECRET,
      audience: TOKEN_AUDIENCE.session,
    });
    expect(verified).toBeNull();
  });

  it("期限切れのトークンは null になる", async () => {
    const token = await sign({ expiresInSeconds: -10 });
    const verified = await verifyToken(token, SessionPayloadSchema, {
      secret: SECRET,
      audience: TOKEN_AUDIENCE.session,
    });
    expect(verified).toBeNull();
  });

  it("スキーマに合わないペイロードは null になる", async () => {
    const token = await signToken(
      { sub: "not-a-uuid", email: "not-an-email" },
      {
        secret: SECRET,
        audience: TOKEN_AUDIENCE.session,
        expiresInSeconds: 60,
      },
    );
    const verified = await verifyToken(token, SessionPayloadSchema, {
      secret: SECRET,
      audience: TOKEN_AUDIENCE.session,
    });
    expect(verified).toBeNull();
  });

  it("トークンでない文字列は null になる", async () => {
    const verified = await verifyToken("garbage", SessionPayloadSchema, {
      secret: SECRET,
      audience: TOKEN_AUDIENCE.session,
    });
    expect(verified).toBeNull();
  });
});

describe("kindを含まない署名済みセッション", () => {
  it("有効なemailと期限があればaccountとして取得する", async () => {
    const result = await verifyToken(await sign(), VerifiedSessionSchema, {
      secret: SECRET,
      audience: TOKEN_AUDIENCE.session,
    });
    expect(result).toMatchObject({
      ...PAYLOAD,
      kind: "account",
      exp: expect.any(Number),
    });
  });
  it("期限切れなら本人を取得しない", async () => {
    expect(
      await verifyToken(
        await sign({ expiresInSeconds: -10 }),
        VerifiedSessionSchema,
        { secret: SECRET, audience: TOKEN_AUDIENCE.session },
      ),
    ).toBeNull();
  });
});
