import type { Metadata } from "next";
import { landingCopy } from "./landing-copy";

export const landingMetadata: Metadata = {
  title: landingCopy.title,
  description: landingCopy.description,
  alternates: { canonical: "https://ideaboost.dev/" },
  // 共通レイアウトの既定 noindex を上書きし、LP だけを検索に出す。
  robots: { index: true, follow: true },
};
