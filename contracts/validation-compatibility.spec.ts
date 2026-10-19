import { describe, expect, it } from "vitest";
import { AccessEmailSchema } from "./access";
import { ClientMessageSchema } from "./room-protocol";
import { SessionPayloadSchema } from "./session";

describe("認証と WS の入力境界", () => {
  it.each([
    "11111111-1111-1111-1111-111111111111",
    "ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB",
    "00000000-0000-0000-0000-000000000000",
  ])("保存済み UUID 形式 %s を本人 ID として受理する", (sub) => {
    expect(
      SessionPayloadSchema.parse({ sub, email: "user@example.com" }).sub,
    ).toBe(sub);
  });

  it.each(["not-a-uuid", "11111111-1111-1111-1111-11111111111g"])(
    "不正な本人 ID %s を拒否する",
    (sub) => {
      expect(
        SessionPayloadSchema.safeParse({ sub, email: "user@example.com" })
          .success,
      ).toBe(false);
    },
  );

  it("メールの前後の空白を除去して受理する", () => {
    expect(AccessEmailSchema.parse({ email: " user@example.com " })).toEqual({
      email: "user@example.com",
    });
  });

  it.each([{ email: "invalid" }, { email: "user@example.com", role: "admin" }])(
    "不正なメールまたは未知の権限フィールド %j を拒否する",
    (input) => {
      expect(AccessEmailSchema.safeParse(input).success).toBe(false);
    },
  );

  it("安全な整数範囲を超えるホスト revision を拒否する", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "host:transfer",
        targetUserId: "11111111-1111-4111-8111-111111111111",
        expectedHostRevision: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });

  it("安全な整数の上限のホスト revision を受理する", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "host:transfer",
        targetUserId: "11111111-1111-4111-8111-111111111111",
        expectedHostRevision: Number.MAX_SAFE_INTEGER,
      }).success,
    ).toBe(true);
  });
});
