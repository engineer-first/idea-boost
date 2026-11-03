import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const fonts = vi.hoisted(() => ({
  noto: vi.fn((_options: Record<string, unknown>) => ({ variable: "noto" })),
  zen: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Noto_Sans_JP: fonts.noto,
  Zen_Maru_Gothic: fonts.zen,
  Geist: () => ({ variable: "sans" }),
  Geist_Mono: () => ({ variable: "mono" }),
}));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

beforeEach(() => vi.resetModules());

it("日本語UIを日本語として読み上げる文書言語を配信する", async () => {
  const { default: RootLayout } = await import("./layout");
  const markup = renderToStaticMarkup(
    await RootLayout({ children: <main>ログイン</main> }),
  );
  const document = new DOMParser().parseFromString(markup, "text/html");
  expect(document.documentElement.lang).toBe("ja");
});

it("全画面の本文にswapの可変Notoを使い、LPのZenは読み込まない", async () => {
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
