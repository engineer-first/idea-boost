import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/features/landing";

// 検索に出すかどうかは各画面の robots メタ（LP と解説ページ以外は noindex）で決める。
// ここで画面を Disallow すると noindex を読めなくなるため、API だけを外す。
// AI のクローラーも学習・検索とも同じく通す（2026-11-27 オーナー決定）。
// Cloudflare の管理 robots.txt と AI ボットのブロックは切ってあるので、本番もこの内容だけが返る。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
