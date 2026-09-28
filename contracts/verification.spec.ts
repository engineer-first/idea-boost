import { describe, expect, it } from "vitest";
import {
  VERIFICATION_CHECKPOINTS,
  VerificationCreateRequestSchema,
} from "./verification";

describe("検証状態の指定", () => {
  it("待機と全14ステップへ直接移動できる", () => {
    expect(VERIFICATION_CHECKPOINTS).toHaveLength(15);
    for (const checkpoint of VERIFICATION_CHECKPOINTS) {
      expect(
        VerificationCreateRequestSchema.safeParse({ checkpoint: checkpoint.id })
          .success,
      ).toBe(true);
    }
  });
  it("任意のユーザーや不正なステップは受け付けない", () => {
    expect(
      VerificationCreateRequestSchema.safeParse({ checkpoint: "2-5" }).success,
    ).toBe(false);
    expect(
      VerificationCreateRequestSchema.safeParse({
        checkpoint: "3-1",
        authorId: "other",
      }).success,
    ).toBe(false);
  });
});
