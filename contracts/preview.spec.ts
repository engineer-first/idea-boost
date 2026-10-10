import { expect, it } from "vitest";
import { PreviewCreateRequestSchema } from "./preview";

it("本人・ルームの指定や未定義ステップを受理しない", () => {
  for (const body of [
    { checkpoint: "1-1", authorId: "another-user" },
    { checkpoint: "1-1", roomId: "existing-room" },
    { checkpoint: "2-5" },
    { checkpoint: "lobby" },
  ])
    expect(PreviewCreateRequestSchema.safeParse(body).success).toBe(false);
  expect(
    PreviewCreateRequestSchema.safeParse({ checkpoint: "3-5" }).success,
  ).toBe(true);
});
