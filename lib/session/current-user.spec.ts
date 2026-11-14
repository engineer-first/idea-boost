import { afterEach, beforeEach, expect, it, vi } from "vitest";

const headers = vi.hoisted(() => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

vi.mock("next/headers", () => ({ cookies: headers.cookies }));

beforeEach(() => {
  headers.cookies.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// 本番ビルドは SESSION_SECRET なしで走り、実行時だけ秘密鍵がある。
// 未設定時に Cookie を読まないと、共通レイアウトを通る画面（404・privacy）が
// ビルドで静的と判定され、実行時の Cookie 読み取りで DYNAMIC_SERVER_USAGE の 500 になる。
it("SESSION_SECRET が未設定でも Cookie を読み、未ログインとして null を返す", async () => {
  vi.stubEnv("SESSION_SECRET", "");
  const { getCurrentUser } = await import("./current-user");

  await expect(getCurrentUser()).resolves.toBeNull();
  expect(headers.cookies).toHaveBeenCalledTimes(1);
});
