import { describe, expect, it } from "vitest";
import {
  DemoActionRequestSchema,
  DemoCheckpointSchema,
  DemoCreateRequestSchema,
} from "./demo";

describe("デモ境界", () => {
  it("5つの見せ場だけを受け入れる", () => {
    for (const checkpoint of ["start", "share", "vote", "ideas", "complete"])
      expect(DemoCheckpointSchema.safeParse(checkpoint).success).toBe(true);
    expect(DemoCheckpointSchema.safeParse("arbitrary").success).toBe(false);
  });
  it("任意ユーザーやフェーズ上書きを入力できない", () => {
    expect(
      DemoActionRequestSchema.safeParse({
        action: "share",
        phase: 1,
        step: 2,
        actorId: "other",
      }).success,
    ).toBe(false);
    expect(
      DemoCreateRequestSchema.safeParse({ checkpoint: "start", phase: 3 })
        .success,
    ).toBe(false);
  });
});
