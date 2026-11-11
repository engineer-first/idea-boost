import { describe, expect, it } from "vitest";
import {
  isPreviewPartnerEmail,
  PreviewCreateRequestSchema,
  previewPartnerEmail,
  previewPrincipalEmail,
} from "./preview";

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

describe("相手役のアドレス", () => {
  it("本人と別のアドレスを作り、本人のアドレスへ戻せる", () => {
    const partner = previewPartnerEmail("dev.name@example.com");
    expect(partner).toBe("dev.name+idea-boost-partner@example.com");
    expect(isPreviewPartnerEmail(partner)).toBe(true);
    expect(isPreviewPartnerEmail("dev.name@example.com")).toBe(false);
    expect(previewPrincipalEmail(partner)).toBe("dev.name@example.com");
    expect(previewPrincipalEmail("dev+other@example.com")).toBe(
      "dev+other@example.com",
    );
  });
});
