import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  prepare: vi.fn(),
  google: vi.fn(),
}));
vi.mock("next/navigation", async (importOriginal) => {
  const navigation = await importOriginal<typeof import("next/navigation")>();
  return {
    ...navigation,
    useRouter: () => ({ replace: mocks.replace }),
    redirect: vi.fn(navigation.redirect),
  };
});
vi.mock("@/features/auth/logic/guest-identity-actions", () => ({
  prepareGuestIdentity: mocks.prepare,
}));

vi.mock("@/features/auth/logic/actions", () => ({
  signInWithGoogle: mocks.google,
  signInWithDevPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => null,
}));
vi.mock("@/lib/session/env", () => ({
  isAuthConfigured: () => true,
  isDevAuthEnabled: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prepare.mockResolvedValue({
    ok: true,
    principal: {
      kind: "guest",
      userId: "11111111-1111-4111-8111-111111111111",
    },
    reused: false,
  });
});

import LoginPage from "./page";

it.each([
  undefined,
  "/",
  "https://evil.example",
  "/invite/ABC123",
  "/shared-outcomes?status=confirmed#results",
])("説明リンクに安全な戻り先を引き継ぐ: %s", async (next) => {
  render(await LoginPage({ searchParams: Promise.resolve({ next }) }));
  const expected =
    !next || next === "/" || next.startsWith("https:")
      ? "/about"
      : `/about?next=${encodeURIComponent(next)}`;
  expect(screen.getByRole("link", { name: "IdeaBoostとは？" })).toHaveAttribute(
    "href",
    expected,
  );
});

it.each([
  { next: "https://evil.example", expected: "/" },
  { next: "//evil.example", expected: "/" },
  { next: "/invite/ABC123", expected: "/invite/ABC123" },
])(
  "ログインページでnext=$nextからゲスト名を登録すると安全化した$expectedへ遷移する",
  async ({ next, expected }) => {
    render(await LoginPage({ searchParams: Promise.resolve({ next }) }));
    fireEvent.click(screen.getByRole("button", { name: "ゲストではじめる" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "仲間に表示される名前" }),
      {
        target: { value: "はな" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "この名前ではじめる" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(expected),
    );
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith({ name: "はな" });
  },
);

it.each([
  { guestNext: "/home", expected: "/home" },
  { guestNext: "https://evil.com", expected: "/" },
  { guestNext: "//evil.com", expected: "/" },
])(
  "ゲストの戻り先$guestNextで名前を登録すると$expectedへ進みGoogleは元の画面へ戻る",
  async ({ guestNext, expected }) => {
    const next = "/rooms/room-id?tab=1";
    render(
      await LoginPage({
        searchParams: Promise.resolve({ next, guest_next: guestNext }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Googleではじめる" }));
    await waitFor(() =>
      expect(mocks.google).toHaveBeenCalledWith(next, expect.any(FormData)),
    );
    fireEvent.click(screen.getByRole("button", { name: "ゲストではじめる" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "仲間に表示される名前" }),
      { target: { value: "はな" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "この名前ではじめる" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(expected),
    );
  },
);
