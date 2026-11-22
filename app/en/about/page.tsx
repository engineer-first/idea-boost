import type { Metadata } from "next";
import {
  getLandingEntry,
  getLandingMetadata,
  LandingView,
} from "@/features/landing";
import { getBrowserLocale } from "@/lib/i18n/request-locale";
import { getCurrentUser } from "@/lib/session/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = getLandingMetadata("en");

type EnglishAboutPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};
export default async function EnglishAboutPage({
  searchParams,
}: EnglishAboutPageProps) {
  const { next } = await searchParams;
  const isLoggedIn = Boolean(await getCurrentUser());
  return (
    <LandingView
      locale="en"
      browserLocale={await getBrowserLocale()}
      isLoggedIn={isLoggedIn}
      entry={getLandingEntry(
        isLoggedIn,
        typeof next === "string" ? next : undefined,
        "en",
      )}
    />
  );
}
