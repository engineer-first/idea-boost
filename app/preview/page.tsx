import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewConsole } from "@/features/preview";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview | Idea Boost" };
export default async function PreviewPage() {
  if (process.env.PREVIEW_ENABLED !== "true" || !(await getCurrentUser()))
    notFound();
  return <PreviewConsole />;
}
