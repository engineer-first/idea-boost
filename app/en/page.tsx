import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getLandingEntry,
  getLandingMetadata,
  LandingView,
} from "@/features/landing";
import { getBrowserLocale } from "@/lib/i18n/request-locale";
import { getCurrentUser } from "@/lib/session/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = getLandingMetadata("en");

export default async function EnglishRootPage() {
  await headers(); // OpenNext で redirect() をエラーバウンダリに捕捉させないための workaround
  if (await getCurrentUser()) redirect("/home");
  return (
    <LandingView
      locale="en"
      browserLocale={await getBrowserLocale()}
      isLoggedIn={false}
      entry={getLandingEntry(false, undefined, "en")}
    />
  );
}
