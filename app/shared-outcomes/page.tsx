import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SharedOutcomes } from "@/features/shared-outcomes";
import { getCurrentUser } from "@/lib/session/current-user";
export const metadata: Metadata = {
  title: "共有成果 | Idea Boost",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
export default async function SharedOutcomesPage() {
  if (!(await getCurrentUser())) redirect("/login?next=%2Fshared-outcomes");
  return <SharedOutcomes />;
}
