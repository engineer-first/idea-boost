import type { AppLocale } from "@/lib/i18n/locale";
import type appEn from "@/messages/en/app.json";
import type landingJa from "@/messages/ja/landing.json";

// 英語 JSON を共通スキーマとして使い、日本語側の不足キーも型で検出する。
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: { app: typeof appEn; landing: typeof landingJa };
  }
}
