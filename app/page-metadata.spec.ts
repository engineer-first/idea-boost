// @vitest-environment node
// 検索・共有に出す画面の境界（#993）。LP だけを検索に出し、
// ほかの画面は noindex にして画面ごとの title を付ける。
import type { Metadata } from "next";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Noto_Sans_JP: () => ({ variable: "noto" }),
  Geist_Mono: () => ({ variable: "mono" }),
}));
vi.mock("@/lib/session/current-user", () => ({
  getCurrentUser: async () => null,
}));

import { metadata as rootMetadata } from "./layout";

// Next.js はページの metadata をキーごとにレイアウトの値へ上書きする。
function resolve(page: Metadata): Metadata {
  return { ...rootMetadata, ...page };
}

function isIndexed(metadata: Metadata): boolean {
  const { robots } = metadata;
  if (robots === undefined || robots === null) return true;
  if (typeof robots === "string") return !robots.includes("noindex");
  return robots.index !== false;
}

describe("検索に出す画面", () => {
  it("LP（/ と /about）だけを検索に出す", async () => {
    const top = await import("./page");
    const about = await import("./about/page");
    expect(isIndexed(resolve(top.metadata))).toBe(true);
    expect(isIndexed(resolve(about.metadata))).toBe(true);
  });

  it("metadata を持たない画面は共通の既定で noindex になり、LP の説明文を引き継がない", async () => {
    const top = await import("./page");
    expect(isIndexed(rootMetadata)).toBe(false);
    expect(rootMetadata.description).not.toBe(top.metadata.description);
  });
});

describe("LP のリンクプレビュー", () => {
  it("/ と /about は同じ画像と説明を OGP・X に出す", async () => {
    const top = await import("./page");
    const about = await import("./about/page");
    expect(rootMetadata.metadataBase?.toString()).toBe(
      "https://ideaboost.dev/",
    );
    for (const { metadata } of [top, about]) {
      expect(metadata.openGraph).toMatchObject({
        title: metadata.title,
        description: metadata.description,
        url: "https://ideaboost.dev/",
        siteName: "Idea Boost",
        locale: "ja_JP",
        type: "website",
        images: [{ url: "/brand/ogp.png", width: 1200, height: 630 }],
      });
      expect(metadata.twitter).toMatchObject({
        card: "summary_large_image",
        title: metadata.title,
        description: metadata.description,
        images: ["/brand/ogp.png"],
      });
    }
  });
});

describe("LP の言語別 URL", () => {
  const languages = {
    ja: "https://ideaboost.dev/",
    en: "https://ideaboost.dev/en",
    "x-default": "https://ideaboost.dev/",
  };

  it("日本語の / と /about は / を正とし、英語版 /en を hreflang で示す", async () => {
    const top = await import("./page");
    const about = await import("./about/page");
    for (const { metadata } of [top, about]) {
      expect(metadata.alternates).toEqual({
        canonical: "https://ideaboost.dev/",
        languages,
      });
      expect(metadata.openGraph).toMatchObject({
        locale: "ja_JP",
        alternateLocale: ["en_US"],
      });
    }
  });

  it("英語の /en と /en/about は英語の title・OG を持ち、/en を正として日本語版を示す", async () => {
    const top = await import("./en/page");
    const about = await import("./en/about/page");
    for (const { metadata } of [top, about]) {
      expect(isIndexed(resolve(metadata))).toBe(true);
      expect(metadata.title).toContain("brainstorming");
      expect(metadata.alternates).toEqual({
        canonical: "https://ideaboost.dev/en",
        languages,
      });
      expect(metadata.openGraph).toMatchObject({
        title: metadata.title,
        description: metadata.description,
        url: "https://ideaboost.dev/en",
        siteName: "Idea Boost",
        locale: "en_US",
        alternateLocale: ["ja_JP"],
        type: "website",
        images: [{ url: "/brand/ogp.png", width: 1200, height: 630 }],
      });
      expect(metadata.twitter).toMatchObject({
        card: "summary_large_image",
        title: metadata.title,
        description: metadata.description,
        images: ["/brand/ogp.png"],
      });
    }
  });
});

describe("LP 以外の画面の title", () => {
  const pages: [string, () => Promise<{ metadata: Metadata }>][] = [
    ["/home", () => import("./home/page")],
    ["/rooms/[id]", () => import("./rooms/[id]/page")],
    ["/rooms/[id]/start", () => import("./rooms/[id]/start/page")],
    ["/completed-rooms", () => import("./completed-rooms/page")],
    ["/completed-rooms/[id]", () => import("./completed-rooms/[id]/page")],
    ["/privacy", () => import("./privacy/page")],
    ["/auth/resume", () => import("./auth/resume/page")],
    ["/invite/[inviteCode]", () => import("./invite/[inviteCode]/page")],
  ];

  it.each(pages)(
    "%s は画面名の title を持ち、noindex になる",
    async (_path, load) => {
      const { metadata } = await load();
      const resolved = resolve(metadata);
      expect(resolved.title).toMatch(/^.+ \| Idea Boost$/);
      expect(isIndexed(resolved)).toBe(false);
    },
  );
});

describe("招待URLのプレビュー", () => {
  it("/invite/[inviteCode] は招待だと分かる固定の説明を OGP にも出す", async () => {
    const { metadata } = await import("./invite/[inviteCode]/page");
    expect(metadata.description).toContain("招待");
    expect(metadata.openGraph?.description).toBe(metadata.description);
  });

  it("/invite/[inviteCode] は LP と同じ画像の大きいカードを出し、noindex のまま", async () => {
    const top = await import("./page");
    const { metadata } = await import("./invite/[inviteCode]/page");
    expect(metadata.openGraph).toMatchObject({
      title: metadata.title,
      description: metadata.description,
      images: top.metadata.openGraph?.images,
    });
    expect(metadata.twitter).toEqual({
      card: "summary_large_image",
      title: metadata.title,
      description: metadata.description,
      images: top.metadata.twitter?.images,
    });
    expect(isIndexed(resolve(metadata))).toBe(false);
  });

  it("未ログインで招待URLから転送された /login は招待の説明を出す", async () => {
    const login = await import("./login/page");
    const invite = await import("./invite/[inviteCode]/page");
    const metadata = await login.generateMetadata({
      searchParams: Promise.resolve({ next: "/invite/ABC234" }),
    });
    // 未ログインのクローラーは転送先の /login を読むため、招待と同じカードを出す。
    expect(metadata).toEqual(invite.metadata);
    expect(isIndexed(resolve(metadata))).toBe(false);
  });

  it("招待以外から /login を開くとログインの title を出す", async () => {
    const login = await import("./login/page");
    const metadata = await login.generateMetadata({
      searchParams: Promise.resolve({ next: "/home" }),
    });
    expect(metadata.title).toBe("ログイン | Idea Boost");
  });
});
