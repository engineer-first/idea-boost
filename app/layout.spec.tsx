import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const fonts = vi.hoisted(() => ({
  noto: vi.fn((_options: Record<string, unknown>) => ({ variable: "noto" })),
  zen: vi.fn(),
}));
const language = vi.hoisted(() => ({ value: "en-US,en;q=0.9" }));

vi.mock("next/font/google", () => ({
  Noto_Sans_JP: fonts.noto,
  Zen_Maru_Gothic: fonts.zen,
  Geist_Mono: () => ({ variable: "mono" }),
}));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("next-intl/server", () => ({ getMessages: async () => ({}) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "accept-language": language.value }),
}));

beforeEach(() => {
  vi.resetModules();
  language.value = "en-US,en;q=0.9";
});

it("英語を優先するブラウザへ英語の文書言語を配信する", async () => {
  const { default: RootLayout } = await import("./layout");
  const markup = renderToStaticMarkup(
    await RootLayout({ children: <main>ログイン</main> }),
  );
  const document = new DOMParser().parseFromString(markup, "text/html");
  expect(document.documentElement.lang).toBe("en");
});

it("日本語を優先するブラウザへ日本語の文書言語を配信する", async () => {
  language.value = "ja-JP,ja;q=0.9,en;q=0.8";
  const { default: RootLayout } = await import("./layout");
  const markup = renderToStaticMarkup(
    await RootLayout({ children: <main>本文</main> }),
  );
  const document = new DOMParser().parseFromString(markup, "text/html");
  expect(document.documentElement.lang).toBe("ja");
});

it("LPを含む全画面の本文にswapの可変Notoを使い、Zenは読み込まない", async () => {
  const { default: RootLayout } = await import("./layout");
  const markup = renderToStaticMarkup(
    await RootLayout({ children: <main>本文</main> }),
  );
  const document = new DOMParser().parseFromString(markup, "text/html");
  expect(document.documentElement.classList.contains("noto")).toBe(true);
  expect(fonts.noto).toHaveBeenCalledWith(
    expect.objectContaining({
      display: "swap",
      preload: false,
      variable: "--font-noto-sans-jp",
    }),
  );
  expect(fonts.noto.mock.calls[0]?.[0]).not.toHaveProperty("weight");
  expect(fonts.zen).not.toHaveBeenCalled();
});
