import { expect, it } from "vitest";
import { RoomInfoResponseSchema } from "./api";
import { ParticipationSourceSchema } from "./room-participation";

it("ルーム情報はホスト権限やホストのIDを公開しない", () => {
  const parsed = RoomInfoResponseSchema.parse({
    roomId: crypto.randomUUID(),
    inviteCode: "ABC234",
    phase: { kind: "lobby" },
    isHost: true,
    hostUserId: crypto.randomUUID(),
  });
  expect(parsed).not.toHaveProperty("isHost");
  expect(parsed).not.toHaveProperty("hostUserId");
});
it("参加切替の元ルームは退出だけを表しホスト世代や移譲先を持たない", () => {
  const source = {
    roomId: crypto.randomUUID(),
    name: "ルーム",
    inviteCode: "ABC234",
    action: "leave",
  };
  expect(ParticipationSourceSchema.safeParse(source).success).toBe(true);
  expect(
    ParticipationSourceSchema.parse({
      ...source,
      hostUserId: crypto.randomUUID(),
      hostRevision: 4,
      successor: null,
    }),
  ).toEqual(source);
  expect(
    ParticipationSourceSchema.safeParse({ ...source, action: "transfer" })
      .success,
  ).toBe(false);
  expect(
    ParticipationSourceSchema.safeParse({ ...source, action: "disband" })
      .success,
  ).toBe(false);
});
