import type { Metadata } from "next";
import { SHARE_IMAGE } from "@/lib/share-image";

// 招待URLを LINE 等に貼ったときのプレビュー。招待コードは誰でも推測して
// 開けるため、ルーム名・人の名前は出さず、招待だと分かる固定の文言にする（#993）。
// 画像は LP と同じものを大きいカードで出し、何のアプリかを一目で伝える（#995）。
const title = "ルームへの招待 | Idea Boost";
const description =
  "Idea Boostのアイデア出しルームに招待されています。リンクを開いて参加してください。";

export const inviteMetadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "Idea Boost",
    type: "website",
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [SHARE_IMAGE.url],
  },
} as const satisfies Metadata;
