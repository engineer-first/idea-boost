import { describe, expect, it } from "vitest";
import { RoomMemberSchema } from "./api";
import { ClientMessageSchema, MemberSchema } from "./room-protocol";

const userId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
describe("顔アイコンの通信境界", () => {
  it("顔や変更対象をクライアントに指定させず、本人のランダム変更だけを受け付ける", () => {
    const message = { type: "member:randomize-avatar", operationId };
    expect(ClientMessageSchema.safeParse(message).success).toBe(true);
    for (const extra of [
      { userId },
      { avatarId: "face-01" },
      { color: "pink" },
    ])
      expect(
        ClientMessageSchema.safeParse({ ...message, ...extra }).success,
      ).toBe(false);
  });
  it("用意した20種類以外の顔IDを受け取らない", () => {
    const member = { userId, name: "はな", color: "yellow" };
    for (const avatarId of [
      "face-00",
      "face-21",
      "https://example.test/a.png",
      "",
      null,
    ])
      expect(MemberSchema.safeParse({ ...member, avatarId }).success).toBe(
        false,
      );
  });
});

it("初期表示用APIも、割り当てられた顔IDを失わず読み取る", () => {
  const member = { userId, name: "はな", color: "yellow", avatarId: "face-07" };
  expect(RoomMemberSchema.parse(member)).toEqual(member);
});
