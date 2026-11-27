import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/features/landing";

// 検索に出すかどうかは各画面の robots メタ（LP と解説ページ以外は noindex）で決める。
// ここで画面を Disallow すると noindex を読めなくなるため、API だけを外す。
// 本番では Cloudflare の管理 robots.txt がこの内容の前に付く。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
