import { describe, expect, it } from "vitest";
import { buildInviteMessage } from "./invite-message";

describe("buildInviteMessage", () => {
  it("ルーム名・参加リンク・招待コードを、チャットへそのまま貼れる行に並べる", () => {
    expect(
      buildInviteMessage({
        roomName: "J05",
        inviteCode: "AB12CD",
        inviteUrl: "https://idea-flow.example/invite/AB12CD",
      }),
    ).toBe(
      [
        "IdeaBoost のルーム「J05」に招待します。",
        "参加リンク: https://idea-flow.example/invite/AB12CD",
        "招待コード: AB12CD",
      ].join("\n"),
    );
  });

  it.each([null, undefined, "", "   "])(
    "ルーム名が無いとき（%j）は名前を出さずに案内する",
    (roomName) => {
      expect(
        buildInviteMessage({
          roomName,
          inviteCode: "AB12CD",
          inviteUrl: "https://idea-flow.example/invite/AB12CD",
        }).split("\n")[0],
      ).toBe("IdeaBoost のルームに招待します。");
    },
  );

  it("ルーム名の前後の空白は落とす", () => {
    expect(
      buildInviteMessage({
        roomName: "  J05 ",
        inviteCode: "AB12CD",
        inviteUrl: "https://idea-flow.example/invite/AB12CD",
      }).split("\n")[0],
    ).toBe("IdeaBoost のルーム「J05」に招待します。");
  });
});
