import { notFound } from "next/navigation";
import { PreviewConsole } from "@/features/preview";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export default async function PreviewPage() {
  if (process.env.PREVIEW_ENABLED !== "true" || !(await getCurrentUser()))
    notFound();
  return <PreviewConsole />;
}
