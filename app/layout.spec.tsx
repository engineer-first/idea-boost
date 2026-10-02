import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "sans" }),
  Geist_Mono: () => ({ variable: "mono" }),
}));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => null,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

import RootLayout from "./layout";

it("日本語UIを日本語として読み上げる文書言語を配信する", async () => {
  const markup = renderToStaticMarkup(
    await RootLayout({ children: <main>ログイン</main> }),
  );
  const document = new DOMParser().parseFromString(markup, "text/html");
  expect(document.documentElement.lang).toBe("ja");
});
