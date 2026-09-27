import type { Metadata } from "next";
import { SharedOutcomes } from "@/features/shared-outcomes";
export const metadata: Metadata = {
  title: "共有成果 | Idea Boost",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
export default function SharedOutcomesPage() {
  return <SharedOutcomes />;
}
