import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeedbackList } from "@/features/feedback";
import { getCurrentUser } from "@/lib/session/current-user";
export const metadata: Metadata = {
  title: "利用者の意見 | Idea Boost",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";
export default async function FeedbackPage() {
  if (!(await getCurrentUser())) redirect("/login?next=%2Ffeedback");
  return <FeedbackList />;
}
