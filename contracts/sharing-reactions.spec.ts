import { describe, expect, it } from "vitest";
import { ClientMessageSchema, ServerMessageSchema } from "./room-protocol";

describe("共有中のリアクションの送受信", () => {
  const request = { type: "reaction:send", kind: "like", phaseRevision: 3 };

  it.each(["like", "clap", "surprised", "insight", "question"])(
    "%sでも受信者や送信者の情報を要求に含められない",
    (kind) => {
      for (const extra of [
        { userId: "11111111-1111-4111-8111-111111111111" },
        { roomId: "another-room" },
        { senderId: "22222222-2222-4222-8222-222222222222" },
        { kind: "applause" },
        { phaseRevision: -1 },
      ]) {
        expect(
          ClientMessageSchema.safeParse({ ...request, kind, ...extra }).success,
        ).toBe(false);
      }
    },
  );

  it.each(["like", "clap", "surprised", "insight", "question"])(
    "現在工程の世代と選んだ%sを送信できる",
    (kind) => {
      expect(ClientMessageSchema.parse({ ...request, kind })).toEqual({
        ...request,
        kind,
      });
      expect(
        ClientMessageSchema.safeParse({ type: "reaction:send", kind }).success,
      ).toBe(false);
    },
  );

  it.each(["like", "clap", "surprised", "insight", "question"])(
    "%sの配信を種類を保った一時イベントとして受信できる",
    (kind) => {
      const event = {
        type: "reaction:received",
        id: "22222222-2222-4222-8222-222222222222",
        senderId: "11111111-1111-4111-8111-111111111111",
        kind,
        phaseRevision: 3,
      };
      expect(ServerMessageSchema.parse(event)).toEqual(event);
      expect(
        ServerMessageSchema.safeParse({ ...event, senderId: undefined })
          .success,
      ).toBe(false);
      expect(
        ServerMessageSchema.safeParse({ ...event, kind: "applause" }).success,
      ).toBe(false);
    },
  );
});
