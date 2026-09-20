import { notFound, redirect } from "next/navigation";
import { VerificationWorkspaceSchema } from "@/contracts/verification";
import {
  getVerificationActive,
  isVerificationEnabled,
} from "@/features/verification";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export default async function VerificationBoardPage() {
  if (!isVerificationEnabled()) notFound();
  if (!(await getCurrentUser()))
    redirect("/login?next=%2Fdev%2Fverify%2Fboard");
  const response = await getVerificationActive();
  if (!response.ok) redirect("/dev/verify");
  const { active } = VerificationWorkspaceSchema.parse(await response.json());
  if (!active) redirect("/dev/verify");
  redirect(`/rooms/${active.roomId}?verify=follow`);
}
