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

  it("未ログインで招待URLから転送された /login は招待の説明を出す", async () => {
    const login = await import("./login/page");
    const invite = await import("./invite/[inviteCode]/page");
    const metadata = await login.generateMetadata({
      searchParams: Promise.resolve({ next: "/invite/ABC234" }),
    });
    expect(metadata.description).toBe(invite.metadata.description);
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
