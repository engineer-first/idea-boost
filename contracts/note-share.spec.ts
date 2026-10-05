import { describe, expect, it } from "vitest";
import { ClientMessageSchema, ServerMessageSchema } from "./room-protocol";

const id = "11111111-1111-4111-8111-111111111111";
describe("共有確定境界", () => {
  it("操作照会と成功receiptを受け取り、作者情報の注入を拒否する", () => {
    expect(
      ClientMessageSchema.safeParse({
        type: "note:share:status",
        operationId: id,
      }).success,
    ).toBe(true);
    expect(
      ClientMessageSchema.safeParse({
        type: "note:publish",
        noteId: id,
        x: 1,
        y: 2,
        authorId: id,
      }).success,
    ).toBe(false);
    expect(
      ServerMessageSchema.safeParse({
        type: "note:share:result",
        operationId: id,
        status: "unknown",
      }).success,
    ).toBe(true);
  });
});
