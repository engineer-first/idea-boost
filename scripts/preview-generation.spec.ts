// @vitest-environment node
import { expect, it } from "vitest";
import { previewGeneration } from "./preview-generation.mts";
import {
  previewSchemaMessage,
  readPreviewSchemaMessage,
} from "./preview-migrations.mts";

it("最新のreopenをイベント受信順とは別に識別し、同じheadでも保存先を区別する", () => {
  const event = (id: number, type: string, at: string) => ({
    id,
    event: type,
    created_at: at,
  });
  expect(previewGeneration([])).toBe(0);
  expect(
    previewGeneration([
      event(14, "closed", "2026-10-11T12:00:00Z"),
      event(13, "reopened", "2026-10-11T11:00:00Z"),
      event(12, "reopened", "2026-10-11T10:00:00Z"),
    ]),
  ).toBe(13);
});
it("旧schema記録は初期公開と扱い、開き直した公開ではSQLと世代を両方保存する", () => {
  const hash = "a".repeat(64);
  expect(
    readPreviewSchemaMessage(`idea-boost-preview-schema:v1:${hash}`),
  ).toEqual({ hash, generation: 0 });
  expect(readPreviewSchemaMessage(previewSchemaMessage(hash, 123))).toEqual({
    hash,
    generation: 123,
  });
  expect(() =>
    readPreviewSchemaMessage(
      `idea-boost-preview-schema:v1:${hash}:reopen:invalid`,
    ),
  ).toThrow();
  expect(() => previewSchemaMessage(hash, -1)).toThrow();
});
