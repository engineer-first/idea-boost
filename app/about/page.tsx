import {
  getLandingEntry,
  getLandingMetadata,
  LandingView,
} from "@/features/landing";
import { getDisplayLocale } from "@/lib/i18n/request-locale";
import { getCurrentUser } from "@/lib/session/current-user";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return getLandingMetadata(await getDisplayLocale());
}

type AboutPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};
export default async function AboutPage({ searchParams }: AboutPageProps) {
  const { next } = await searchParams;
  const isLoggedIn = Boolean(await getCurrentUser());
  const locale = await getDisplayLocale();
  return (
    <LandingView
      isLoggedIn={isLoggedIn}
      locale={locale}
      entry={getLandingEntry(
        isLoggedIn,
        typeof next === "string" ? next : undefined,
        locale,
      )}
    />
  );
}
