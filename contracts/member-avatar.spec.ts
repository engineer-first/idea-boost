import { describe, expect, it } from "vitest";
import { RoomMemberSchema } from "./api";
import {
  ClientMessageSchema,
  MemberSchema,
  ServerMessageSchema,
} from "./room-protocol";

const userId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
describe("顔アイコンの通信境界", () => {
  it("顔や変更対象をクライアントに指定させず、本人の顔の巡回変更だけを受け付ける", () => {
    const message = { type: "member:cycle-avatar", operationId };
    expect(ClientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      ClientMessageSchema.safeParse({
        type: "member:randomize-avatar",
        operationId,
      }).success,
    ).toBe(false);
    for (const extra of [
      { userId },
      { avatarId: "face-01" },
      { color: "pink" },
    ])
      expect(
        ClientMessageSchema.safeParse({ ...message, ...extra }).success,
      ).toBe(false);
  });
  it("顔の変更結果に未使用候補数を含めない", () => {
    const message = {
      type: "member:avatar-updated",
      member: {
        userId,
        name: "はな",
        color: "yellow",
        avatarId: "face-07",
      },
      operationId,
    };
    expect(ServerMessageSchema.safeParse(message).success).toBe(true);
    expect(
      ServerMessageSchema.safeParse({
        ...message,
        availableAvatarCount: 12,
      }).success,
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
