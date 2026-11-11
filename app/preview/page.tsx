import { notFound } from "next/navigation";
import { isPreviewPartnerEmail } from "@/contracts/preview";
import { PreviewConsole } from "@/features/preview";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export default async function PreviewPage() {
  const user = await getCurrentUser();
  if (process.env.PREVIEW_ENABLED !== "true" || !user) notFound();
  return (
    <PreviewConsole
      partner={user.email !== null && isPreviewPartnerEmail(user.email)}
    />
  );
}
