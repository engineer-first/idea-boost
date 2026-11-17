import type { AppLocale } from "@/lib/i18n/locale";
import en from "@/messages/en/landing.json";
import ja from "@/messages/ja/landing.json";

export function getLandingContent(locale: AppLocale) {
  return locale === "ja" ? ja : en;
}
