import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LINK_AUDIENCE,
  ACCOUNT_LINK_INTENT_COOKIE,
  ACCOUNT_LINK_INTENT_MAX_SECONDS,
  ACCOUNT_LINK_RESULT_PARAM,
  AccountLinkAssertionSchema,
  AccountLinkIntentSchema,
  AccountLinkResultSchema,
  LinkGoogleRequestSchema,
  LinkGoogleResponseSchema,
} from "./account-link";

const principal = "11111111-1111-4111-8111-111111111111";
const intent = {
  principal,
  state: principal,
  nonce: principal,
  next: "/",
  exp: 1800000000,
};
const assertion = {
  principal,
  googleSub: "google-sub",
  email: "member@example.test",
};

describe("Google連携の境界", () => {
  it("Cookie・期限・用途・結果パラメーターの名前を固定する", () => {
    expect(ACCOUNT_LINK_INTENT_COOKIE).toBe("idea_boost_account_link");
    expect(ACCOUNT_LINK_INTENT_MAX_SECONDS).toBe(600);
    expect(ACCOUNT_LINK_AUDIENCE).toEqual({
      intent: "idea-boost:account-link-intent",
      assertion: "idea-boost:account-link-assertion",
    });
    expect(ACCOUNT_LINK_RESULT_PARAM).toBe("account_link");
  });
  it("有効なintentと連携主張と成功応答を受理する", () => {
    expect(AccountLinkIntentSchema.safeParse(intent).success).toBe(true);
    expect(AccountLinkAssertionSchema.safeParse(assertion).success).toBe(true);
    expect(
      LinkGoogleResponseSchema.safeParse({ ok: true, userId: principal })
        .success,
    ).toBe(true);
  });
  it("GUIDでないprincipalはintentと連携主張の両方で拒否する", () => {
    expect(
      AccountLinkIntentSchema.safeParse({ ...intent, principal: "他人" })
        .success,
    ).toBe(false);
    expect(
      AccountLinkAssertionSchema.safeParse({ ...assertion, principal: "他人" })
        .success,
    ).toBe(false);
  });
  it.each([{ state: "不正" }, { nonce: "不正" }, { exp: 0 }, { exp: 1.5 }])(
    "不正なintent %jを拒否する",
    (invalid) => {
      expect(
        AccountLinkIntentSchema.safeParse({ ...intent, ...invalid }).success,
      ).toBe(false);
    },
  );
  it.each([{ googleSub: "" }, { email: "不正" }])(
    "不正な連携主張 %jを拒否する",
    (invalid) => {
      expect(
        AccountLinkAssertionSchema.safeParse({ ...assertion, ...invalid })
          .success,
      ).toBe(false);
    },
  );
  it("要求の余分なキーと空・8192文字超の主張を拒否する", () => {
    expect(
      LinkGoogleRequestSchema.safeParse({ assertion: "署名", principal })
        .success,
    ).toBe(false);
    for (const value of ["", "x".repeat(8193)])
      expect(
        LinkGoogleRequestSchema.safeParse({ assertion: value }).success,
      ).toBe(false);
    expect(
      LinkGoogleRequestSchema.safeParse({ assertion: "x".repeat(8192) })
        .success,
    ).toBe(true);
  });
  it("未知のreasonと結果コードと不正な成功IDを拒否する", () => {
    expect(
      LinkGoogleResponseSchema.safeParse({ ok: false, reason: "unknown" })
        .success,
    ).toBe(false);
    expect(
      LinkGoogleResponseSchema.safeParse({ ok: true, userId: "不正" }).success,
    ).toBe(false);
    expect(AccountLinkResultSchema.safeParse("unknown").success).toBe(false);
  });
  it.each(["google_account_in_use", "already_linked", "not_guest"])(
    "409の理由%sを受理する",
    (reason) => {
      expect(
        LinkGoogleResponseSchema.safeParse({ ok: false, reason }).success,
      ).toBe(true);
    },
  );
  it.each([
    "linked",
    "cancelled",
    "failed",
    "google_account_in_use",
    "already_linked",
    "session_changed",
    "unavailable",
  ])("結果コード%sを受理する", (result) => {
    expect(AccountLinkResultSchema.safeParse(result).success).toBe(true);
  });
});
