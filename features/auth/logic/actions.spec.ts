// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: true,
  establish: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/session/env", () => ({
  isDevAuthEnabled: () => mocks.enabled,
}));
vi.mock("@/lib/session/establish", () => ({
  establishSession: mocks.establish,
}));

import { signInWithDevPassword } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.establish.mockResolvedValue({ ok: true });
  mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

function credentials(password: string): FormData {
  const form = new FormData();
  form.set("email", "member@example.test");
  form.set("password", password);
  return form;
}

it("入力不正は画面内のエラーとして返し、セッションや遷移を発生させない", async () => {
  await expect(
    signInWithDevPassword("/invite/ABC234", {}, credentials("incorrect")),
  ).resolves.toEqual({ error: "メールアドレスまたはパスワードが違います。" });
  expect(mocks.establish).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("開発認証が無効ならセッションを作らず失敗を返す", async () => {
  mocks.enabled = false;
  await expect(
    signInWithDevPassword("/invite/ABC234", {}, credentials("password")),
  ).resolves.toEqual({ error: "開発用ログインは無効です。" });
  expect(mocks.establish).not.toHaveBeenCalled();
});

it("セッション確立の失敗は画面内へ返す", async () => {
  mocks.establish.mockResolvedValue({
    ok: false,
    error: "接続できませんでした。",
  });
  await expect(
    signInWithDevPassword("/invite/ABC234", {}, credentials("password")),
  ).resolves.toEqual({ error: "接続できませんでした。" });
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each([
  ["/invite/ABC234", "/invite/ABC234"],
  ["https://evil.example", "/"],
  ["//evil.example", "/"],
])("成功時だけ安全な戻り先 %s へ遷移する", async (next, expected) => {
  await expect(
    signInWithDevPassword(next, {}, credentials("password")),
  ).rejects.toThrow(`redirect:${expected}`);
  expect(mocks.establish).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "dev", email: "member@example.test" }),
  );
});
