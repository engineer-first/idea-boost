import { describe, expect, it } from "vitest";
import { buildInviteMessage } from "./invite-message";

describe("buildInviteMessage", () => {
  it("テーマ・参加リンク・招待コードを、チャットへそのまま貼れる行に並べる", () => {
    expect(
      buildInviteMessage({
        roomName: "J05",
        inviteCode: "AB12CD",
        inviteUrl: "https://idea-flow.example/invite/AB12CD",
      }),
    ).toBe(
      [
        "Idea Boost のルームに招待します。",
        "テーマ: J05",
        "参加リンク: https://idea-flow.example/invite/AB12CD",
        "招待コード: AB12CD",
      ].join("\n"),
    );
  });

  it.each([null, undefined, "", "   "])(
    "テーマが無いとき（%j）はテーマの行を出さずに案内する",
    (roomName) => {
      expect(
        buildInviteMessage({
          roomName,
          inviteCode: "AB12CD",
          inviteUrl: "https://idea-flow.example/invite/AB12CD",
        }).split("\n"),
      ).toEqual([
        "Idea Boost のルームに招待します。",
        "参加リンク: https://idea-flow.example/invite/AB12CD",
        "招待コード: AB12CD",
      ]);
    },
  );

  it("テーマの前後の空白は落とす", () => {
    expect(
      buildInviteMessage({
        roomName: "  J05 ",
        inviteCode: "AB12CD",
        inviteUrl: "https://idea-flow.example/invite/AB12CD",
      }).split("\n")[1],
    ).toBe("テーマ: J05");
  });
});
