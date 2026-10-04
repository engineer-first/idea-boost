import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  outcomeHref,
  readOutcomeFilters,
  SharedOutcomes,
} from "@/features/shared-outcomes";
import { getCurrentUser } from "@/lib/session/current-user";
export const metadata: Metadata = {
  title: "共有成果 | Idea Boost",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
export default async function SharedOutcomesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getCurrentUser())) {
    const values = await searchParams;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values))
      if (typeof value === "string") params.set(key, value);
    const next = outcomeHref(
      readOutcomeFilters(params),
      params.get("roomId") ?? undefined,
    );
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return <SharedOutcomes />;
}
