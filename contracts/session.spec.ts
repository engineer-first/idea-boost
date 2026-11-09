import { describe, expect, it } from "vitest";
import {
  GuestIdentityInputSchema,
  LoginAssertionSchema,
  SessionPayloadSchema,
  VerifiedSessionSchema,
} from "./session";

const sub = "11111111-1111-4111-8111-111111111111";
const account = {
  kind: "account",
  sub,
  email: "hana@example.test",
  name: "はな",
};
const guest = { kind: "guest", sub, email: null, name: "はな" };

describe("セッションの本人種別", () => {
  it.each([account, guest])(
    "$kind の本人情報を受理し種別を保持する",
    (payload) => {
      expect(SessionPayloadSchema.parse(payload)).toEqual(payload);
    },
  );
  it("kindなし・有効なemailありの入力をaccountに正規化する", () => {
    const { kind: _kind, ...payload } = account;
    expect(SessionPayloadSchema.parse(payload)).toEqual(account);
  });
  it.each([
    { kind: "guest", sub, email: "x@y.test" },
    { kind: "account", sub, email: null },
    { sub },
    { sub, email: null },
    { sub, email: "不正" },
    { kind: "unknown", sub, email: "x@y.test" },
  ])("矛盾または本人情報不足の入力 %j を拒否する", (payload) => {
    expect(SessionPayloadSchema.safeParse(payload).success).toBe(false);
  });
  it.each([account, guest])(
    "$kind の検証済みセッションにはexpが必須",
    (payload) => {
      expect(VerifiedSessionSchema.safeParse(payload).success).toBe(false);
      expect(VerifiedSessionSchema.parse({ ...payload, exp: 123 })).toEqual({
        ...payload,
        exp: 123,
      });
    },
  );
  it("kindなしの検証済みセッションもaccountに正規化する", () => {
    expect(
      VerifiedSessionSchema.parse({ sub, email: account.email, exp: 123 }),
    ).toEqual({ kind: "account", sub, email: account.email, exp: 123 });
  });
});

describe("ゲスト本人の入力境界", () => {
  it.each(["   ", "あ".repeat(16)])(
    "名前 %j のゲスト主張を拒否する",
    (displayName) => {
      expect(
        LoginAssertionSchema.safeParse({
          kind: "guest",
          userId: sub,
          displayName,
        }).success,
      ).toBe(false);
    },
  );
  it("15文字の名前とguidのゲスト主張を受理する", () => {
    const assertion = {
      kind: "guest",
      userId: sub,
      displayName: "あ".repeat(15),
    };
    expect(LoginAssertionSchema.parse(assertion)).toEqual(assertion);
  });
  it("guidでないゲスト主張を拒否する", () => {
    expect(
      LoginAssertionSchema.safeParse({
        kind: "guest",
        userId: "不正",
        displayName: "はな",
      }).success,
    ).toBe(false);
  });
  it.each(["   ", "あ".repeat(16)])(
    "名前 %j のAction入力を拒否する",
    (name) => {
      expect(GuestIdentityInputSchema.safeParse({ name }).success).toBe(false);
    },
  );
  it("名前だけのAction入力を受理する", () => {
    expect(GuestIdentityInputSchema.parse({ name: "あ".repeat(15) })).toEqual({
      name: "あ".repeat(15),
    });
  });
  it("userIdを追加したAction入力を拒否する", () => {
    expect(
      GuestIdentityInputSchema.safeParse({ name: "はな", userId: sub }).success,
    ).toBe(false);
  });
});
