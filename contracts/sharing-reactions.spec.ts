import { describe, expect, it } from "vitest";
import { ClientMessageSchema, ServerMessageSchema } from "./room-protocol";

describe("共有中のいいねの送受信", () => {
  const request = { type: "reaction:send", kind: "like", phaseRevision: 3 };

  it("受信者や送信者の情報は要求に含められない", () => {
    for (const extra of [
      { userId: "11111111-1111-4111-8111-111111111111" },
      { roomId: "another-room" },
      { senderId: "22222222-2222-4222-8222-222222222222" },
      { kind: "applause" },
      { phaseRevision: -1 },
    ]) {
      expect(
        ClientMessageSchema.safeParse({ ...request, ...extra }).success,
      ).toBe(false);
    }
  });

  it("現在工程の世代といいねだけを送信できる", () => {
    expect(ClientMessageSchema.parse(request)).toEqual(request);
    expect(
      ClientMessageSchema.safeParse({ type: "reaction:send", kind: "like" })
        .success,
    ).toBe(false);
  });

  it("配信は個人の作業内容を含まない一時イベントとして受信できる", () => {
    const event = {
      type: "reaction:received",
      id: "22222222-2222-4222-8222-222222222222",
      senderId: "11111111-1111-4111-8111-111111111111",
      kind: "like",
      phaseRevision: 3,
    };
    expect(ServerMessageSchema.parse(event)).toEqual(event);
    expect(
      ServerMessageSchema.safeParse({ ...event, senderId: undefined }).success,
    ).toBe(false);
    expect(
      ServerMessageSchema.safeParse({ ...event, kind: "applause" }).success,
    ).toBe(false);
  });
});
