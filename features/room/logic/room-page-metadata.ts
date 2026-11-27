import type { Metadata } from "next";
import type { AppLocale } from "@/lib/i18n/locale";

// ルームの開始待ちとボードは同じタブ名を使う。英語表示でも日本語のタブ名が残らないよう、表示言語で選ぶ。
export function getRoomPageMetadata(locale: AppLocale): Metadata {
  return {
    title: locale === "en" ? "Room | Idea Boost" : "ルーム | Idea Boost",
  };
}
