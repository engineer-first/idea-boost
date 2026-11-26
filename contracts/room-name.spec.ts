import { describe, expect, it } from "vitest";
import { RoomNameSchema } from "./room-name";
import { ClientMessageSchema } from "./room-protocol";

describe("テーマ（ルーム名）の上限", () => {
  it("30文字を受理し、31文字と空白だけを拒否する", () => {
    expect(RoomNameSchema.safeParse("あ".repeat(30)).success).toBe(true);
    expect(RoomNameSchema.safeParse("あ".repeat(31)).success).toBe(false);
    expect(RoomNameSchema.safeParse("　 ").success).toBe(false);
  });

  it("room:rename は30文字を受理し、31文字を拒否する", () => {
    const message = {
      type: "room:rename",
      name: "あ".repeat(30),
      operationId: "11111111-1111-4111-8111-111111111111",
    };
    expect(ClientMessageSchema.safeParse(message).success).toBe(true);
    expect(
      ClientMessageSchema.safeParse({ ...message, name: "あ".repeat(31) })
        .success,
    ).toBe(false);
  });
});
