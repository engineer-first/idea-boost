import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { AppLocaleSchema } from "@/contracts/app-locale";
import { resolveLocale } from "@/lib/i18n/locale";
import appEn from "@/messages/en/app.json";
import landingEn from "@/messages/en/landing.json";
import appJa from "@/messages/ja/app.json";
import landingJa from "@/messages/ja/landing.json";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = AppLocaleSchema.safeParse(await requestLocale);
  const locale = requested.success
    ? requested.data
    : resolveLocale((await headers()).get("accept-language"));
  return {
    locale,
    messages: {
      app: locale === "ja" ? appJa : appEn,
      landing: locale === "ja" ? landingJa : landingEn,
    },
  };
});
