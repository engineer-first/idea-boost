import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { resolveLocale } from "@/lib/i18n/locale";
import appEn from "@/messages/en/app.json";
import appJa from "@/messages/ja/app.json";
import landingEn from "@/messages/en/landing.json";
import landingJa from "@/messages/ja/landing.json";

export default getRequestConfig(async () => {
  const locale = resolveLocale((await headers()).get("accept-language"));
  return {
    locale,
    messages: {
      app: locale === "ja" ? appJa : appEn,
      landing: locale === "ja" ? landingJa : landingEn,
    },
  };
});
