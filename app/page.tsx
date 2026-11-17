import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getLandingEntry,
  getLandingMetadata,
  LandingView,
} from "@/features/landing";
import { getDisplayLocale } from "@/lib/i18n/request-locale";
import { getCurrentUser } from "@/lib/session/current-user";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return getLandingMetadata(await getDisplayLocale());
}

export default async function RootPage() {
  await headers(); // OpenNext で redirect() をエラーバウンダリに捕捉させないための workaround
  if (await getCurrentUser()) redirect("/home");
  const locale = await getDisplayLocale();
  return (
    <LandingView
      locale={locale}
      isLoggedIn={false}
      entry={getLandingEntry(false, undefined, locale)}
    />
  );
}
