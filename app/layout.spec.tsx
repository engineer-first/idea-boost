import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const fonts = vi.hoisted(() => ({
  noto: vi.fn((_options: Record<string, unknown>) => ({ variable: "noto" })),
  zen: vi.fn(),
}));
const language = vi.hoisted(() => ({ value: "en" }));

vi.mock("next/font/google", () => ({
  Noto_Sans_JP: fonts.noto,
  Zen_Maru_Gothic: fonts.zen,
  Geist_Mono: () => ({ variable: "mono" }),
}));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "accept-language": language.value }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => language.value,
  getMessages: async () => ({}),
}));
vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  vi.resetModules();
  language.value = "en";
});

it.each([["en", "en"], ["ja", "ja"]])(
  "選択された表示言語 %s を文書の lang に設定する",
  async (header, expected) => {
    language.value = header;
    const { default: RootLayout } = await import("./layout");
    const markup = renderToStaticMarkup(
      await RootLayout({ children: <main>ログイン</main> }),
    );
    const document = new DOMParser().parseFromString(markup, "text/html");
    expect(document.documentElement.lang).toBe(expected);
  },
);

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
