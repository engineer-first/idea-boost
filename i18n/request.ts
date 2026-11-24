import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import en from "@/messages/en/landing.json";
import ja from "@/messages/ja/landing.json";

// 表示言語は URL で決める（LP は / と /en）。Accept-Language では切り替えない。
// 言語を指定されなかったときは日本語にする。
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) === "en" ? "en" : DEFAULT_LOCALE;
  return {
    locale,
    messages: { landing: locale === "ja" ? ja : en },
  };
});
