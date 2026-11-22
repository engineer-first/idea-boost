import type { AppLocale } from "@/lib/i18n/locale";
import type ja from "@/messages/ja/landing.json";

// 日本語の JSON を正として next-intl の文言に型を付ける。
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: { landing: typeof ja };
  }
}
