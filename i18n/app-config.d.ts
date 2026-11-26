import type { AppLocale } from "@/lib/i18n/locale";
import type appJa from "@/messages/ja/app.json";
import type landingJa from "@/messages/ja/landing.json";

// 日本語の JSON を正として next-intl の文言に型を付ける。
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: { app: typeof appJa; landing: typeof landingJa };
  }
}
