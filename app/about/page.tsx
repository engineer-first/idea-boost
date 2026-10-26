import type { Metadata } from "next";
import {
  getLandingEntry,
  LandingView,
  landingMetadata,
} from "@/features/landing";
import { getCurrentUser } from "@/lib/session/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = landingMetadata;

type AboutPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};
export default async function AboutPage({ searchParams }: AboutPageProps) {
  const { next } = await searchParams;
  const isLoggedIn = Boolean(await getCurrentUser());
  return (
    <LandingView
      isLoggedIn={isLoggedIn}
      entry={getLandingEntry(
        isLoggedIn,
        typeof next === "string" ? next : undefined,
      )}
    />
  );
}
