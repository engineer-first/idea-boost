import { describe, expect, it } from "vitest";
import { buildInvitePath, buildInviteUrl } from "./invite-url";

describe("buildInvitePath", () => {
  it("招待コードから相対パスを作る", () => {
    expect(buildInvitePath("ABC234")).toBe("/invite/ABC234");
  });

  it("コードを URL エンコードする", () => {
    expect(buildInvitePath("a b")).toBe("/invite/a%20b");
  });
});

describe("buildInviteUrl", () => {
  it("origin と結合して絶対 URL を作る", () => {
    expect(buildInviteUrl("https://idea-boost.example", "ABC234")).toBe(
      "https://idea-boost.example/invite/ABC234",
    );
  });

  it("origin 末尾のスラッシュは重複しない", () => {
    expect(buildInviteUrl("https://idea-boost.example/", "ABC234")).toBe(
      "https://idea-boost.example/invite/ABC234",
    );
  });
});
