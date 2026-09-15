// api-worker の REST 境界スキーマの単体テスト。
import { describe, expect, it } from "vitest";
import {
  CreateRoomResponseSchema,
  JoinRoomResponseSchema,
  RoomInfoResponseSchema,
  RoomLookupResponseSchema,
  RoomMembersResponseSchema,
  SyncUserResponseSchema,
} from "./api";
import { buildLobbyPhase } from "./phase.fixture";

const UUID = "11111111-1111-4111-8111-111111111111";
const LOBBY = buildLobbyPhase();

describe("SyncUserResponseSchema", () => {
  it("userId を受け入れる", () => {
    expect(SyncUserResponseSchema.parse({ userId: UUID })).toEqual({
      userId: UUID,
    });
  });

  it("UUID でない userId は拒否する", () => {
    expect(SyncUserResponseSchema.safeParse({ userId: "x" }).success).toBe(
      false,
    );
  });
});

describe("CreateRoomResponseSchema", () => {
  it("roomId と inviteCode を受け入れる", () => {
    expect(
      CreateRoomResponseSchema.parse({ roomId: UUID, inviteCode: "ABC234" }),
    ).toEqual({ roomId: UUID, inviteCode: "ABC234" });
  });
});

describe("JoinRoomResponseSchema", () => {
  it("roomId だけを受け入れる", () => {
    expect(JoinRoomResponseSchema.parse({ roomId: UUID })).toEqual({
      roomId: UUID,
    });
  });
});

describe("RoomInfoResponseSchema", () => {
  it("isHost / hostUserId / phase を含む拡張形を受け入れる", () => {
    const parsed = RoomInfoResponseSchema.parse({
      roomId: UUID,
      inviteCode: "ABC234",
      isHost: true,
      hostUserId: UUID,
      phase: LOBBY,
    });
    expect(parsed).toEqual({
      roomId: UUID,
      inviteCode: "ABC234",
      isHost: true,
      hostUserId: UUID,
      phase: LOBBY,
    });
  });

  it("isHost が無いと拒否する", () => {
    expect(
      RoomInfoResponseSchema.safeParse({
        roomId: UUID,
        inviteCode: "ABC234",
        hostUserId: UUID,
        phase: LOBBY,
      }).success,
    ).toBe(false);
  });

  it("hostUserId が無いと拒否する", () => {
    expect(
      RoomInfoResponseSchema.safeParse({
        roomId: UUID,
        inviteCode: "ABC234",
        isHost: true,
        phase: LOBBY,
      }).success,
    ).toBe(false);
  });

  it("hostUserId が UUID でないと拒否する", () => {
    expect(
      RoomInfoResponseSchema.safeParse({
        roomId: UUID,
        inviteCode: "ABC234",
        isHost: true,
        hostUserId: "not-a-uuid",
        phase: LOBBY,
      }).success,
    ).toBe(false);
  });

  it("phase が未知の値だと拒否する", () => {
    expect(
      RoomInfoResponseSchema.safeParse({
        roomId: UUID,
        inviteCode: "ABC234",
        isHost: false,
        hostUserId: UUID,
        phase: "done",
      }).success,
    ).toBe(false);
  });

  it("isHost は boolean のみ", () => {
    expect(
      RoomInfoResponseSchema.safeParse({
        roomId: UUID,
        inviteCode: "ABC234",
        isHost: "true",
        hostUserId: UUID,
        phase: LOBBY,
      }).success,
    ).toBe(false);
  });
});

describe("RoomMembersResponseSchema", () => {
  it("members 配列を受け入れる", () => {
    expect(
      RoomMembersResponseSchema.parse({
        members: [
          { userId: UUID, name: "Owner", color: "yellow" },
          {
            userId: "22222222-2222-4222-8222-222222222222",
            name: "Member",
            color: "green",
          },
        ],
      }).members,
    ).toHaveLength(2);
  });

  it("空配列も受け入れる", () => {
    expect(RoomMembersResponseSchema.parse({ members: [] })).toEqual({
      members: [],
    });
  });

  it("members キー無しは拒否する", () => {
    expect(RoomMembersResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("RoomLookupResponseSchema", () => {
  it("roomId / inviteCode / hostName を受け入れる", () => {
    expect(
      RoomLookupResponseSchema.parse({
        roomId: UUID,
        inviteCode: "ABC234",
        hostName: "田中太郎",
      }),
    ).toEqual({
      roomId: UUID,
      inviteCode: "ABC234",
      hostName: "田中太郎",
    });
  });

  it("hostName 無しは拒否する", () => {
    expect(
      RoomLookupResponseSchema.safeParse({
        roomId: UUID,
        inviteCode: "ABC234",
      }).success,
    ).toBe(false);
  });

  it("roomId が UUID でないと拒否する", () => {
    expect(
      RoomLookupResponseSchema.safeParse({
        roomId: "not-uuid",
        inviteCode: "ABC234",
        hostName: "Host",
      }).success,
    ).toBe(false);
  });
});
