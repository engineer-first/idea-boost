import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { getDisplayLocale } from "@/lib/i18n/request-locale";
import enLanding from "@/messages/en/landing.json";
import jaLanding from "@/messages/ja/landing.json";

export default getRequestConfig(async () => {
  const locale = await getDisplayLocale();
  return {
    locale,
    // LP は複数行の配列も持つため raw メッセージとして読み込む。
    messages: {
      landing: locale === "ja" ? jaLanding.landingCopy : enLanding.landingCopy,
    } as unknown as AbstractIntlMessages,
  };
});
