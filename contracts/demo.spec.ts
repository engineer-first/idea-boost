import { describe, expect, it } from "vitest";
import {
  DemoActionRequestSchema,
  DemoCheckpointSchema,
  DemoCreateRequestSchema,
} from "./demo";

describe("デモ境界", () => {
  it("全14ステップの見せ場だけを受け入れる", () => {
    for (const checkpoint of [
      "start",
      "share",
      "grouping",
      "vote",
      "problem-decision",
      "hmw",
      "hmw-share",
      "hmw-vote",
      "hmw-decision",
      "ideation",
      "idea-share",
      "ideas",
      "idea-vote",
      "complete",
    ])
      expect(DemoCheckpointSchema.safeParse(checkpoint).success).toBe(true);
    expect(DemoCheckpointSchema.safeParse("arbitrary").success).toBe(false);
  });
  it("グループ例の合図を受け入れる", () => {
    expect(
      DemoActionRequestSchema.safeParse({ action: "group", phase: 1, step: 3 })
        .success,
    ).toBe(true);
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
