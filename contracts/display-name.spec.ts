import { describe, expect, it } from "vitest";
import {
  DisplayNameResponseSchema,
  SetDisplayNameInputSchema,
} from "./display-name";

const principal = "11111111-1111-4111-8111-111111111111";
describe("表示名の入力と既存データの読取", () => {
  it("新しい表示名は15文字まで受理し、16文字と空欄を拒否する", () => {
    expect(
      SetDisplayNameInputSchema.safeParse({
        expectedPrincipal: principal,
        name: "あ".repeat(15),
      }).success,
    ).toBe(true);
    for (const name of ["あ".repeat(16), "　 "])
      expect(
        SetDisplayNameInputSchema.safeParse({
          expectedPrincipal: principal,
          name,
        }).success,
      ).toBe(false);
  });
  it("上限変更前の保存済み表示名は40文字でも読めて、切り詰めない", () => {
    const name = "あ".repeat(40);
    expect(DisplayNameResponseSchema.parse({ name })).toEqual({ name });
    expect(DisplayNameResponseSchema.parse({ name: null })).toEqual({
      name: null,
    });
  });
});

it("Googleプロフィール名は入力上限と独立して50文字でも初期表示として読める", () => {
  const name = "あ".repeat(50);
  expect(DisplayNameResponseSchema.parse({ name })).toEqual({ name });
});
