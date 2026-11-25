/**
 * SNS・チャットに URL を貼ったときのリンクカードの共通画像（public/brand/ogp.png）。
 * LP と招待URLで同じものを出す（#995）。相対パスは root layout の metadataBase で絶対 URL になる。
 */
export const SHARE_IMAGE = {
  url: "/brand/ogp.png",
  width: 1200,
  height: 630,
} as const;
