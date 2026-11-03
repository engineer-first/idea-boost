import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getLandingEntry,
  LandingView,
  landingMetadata,
} from "@/features/landing";
import { getCurrentUser } from "@/lib/session/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = landingMetadata;

export default async function RootPage() {
  await headers(); // OpenNext で redirect() をエラーバウンダリに捕捉させないための workaround
  if (await getCurrentUser()) redirect("/home");
  return <LandingView isLoggedIn={false} entry={getLandingEntry(false)} />;
}
