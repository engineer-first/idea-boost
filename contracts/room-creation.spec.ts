import { describe, expect, it } from "vitest";
import { CreateRoomInputSchema } from "./api";
import {
  CreationIssuedSchema,
  creationIssuedAt,
  issueCreationId,
  ROOM_CREATION_WINDOW_MS,
} from "./room-creation";

describe("作成受付IDの契約", () => {
  it.each([0, 1, 2 ** 48 - 1])("48bit UTC %s を同じ期限へ変換", (time) => {
    const issued = issueCreationId(time);
    expect(creationIssuedAt(issued.requestId)).toBe(time);
    expect(issued.expiresAt).toBe(time + ROOM_CREATION_WINDOW_MS);
  });
  it("大文字はcanonical化し、bodyの偽期限や所有者は拒否", () => {
    const id = issueCreationId().requestId;
    const input = {
      requestId: id.toUpperCase(),
      expectedPrincipal: "11111111-1111-4111-8111-111111111111",
    };
    expect(CreateRoomInputSchema.parse(input).requestId).toBe(id);
    expect(
      CreateRoomInputSchema.safeParse({ ...input, expiresAt: Infinity })
        .success,
    ).toBe(false);
    expect(
      CreateRoomInputSchema.safeParse({
        ...input,
        creator: input.expectedPrincipal,
      }).success,
    ).toBe(false);
  });
  it("発行応答のID時刻/期限の不一致を拒否", () => {
    const issued = issueCreationId(0x000000007000);
    expect(
      CreationIssuedSchema.safeParse({
        ...issued,
        expiresAt: issued.expiresAt + 1,
      }).success,
    ).toBe(false);
    expect(
      CreationIssuedSchema.safeParse({
        ...issued,
        issuedAt: issued.issuedAt + 1,
      }).success,
    ).toBe(false);
    const v4Id = `${issued.requestId.slice(0, 14)}4${issued.requestId.slice(15)}`;
    expect(creationIssuedAt(v4Id)).toBeNull();
  });
});
