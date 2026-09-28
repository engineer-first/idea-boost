import { notFound, redirect } from "next/navigation";
import { VerificationWorkspaceSchema } from "@/contracts/verification";
import {
  getVerificationActive,
  isVerificationEnabled,
  VerificationConsole,
} from "@/features/verification";
import { getCurrentUser } from "@/lib/session/current-user";
import { DEV_USERS } from "@/lib/session/dev-users";
export const dynamic = "force-dynamic";
export default async function VerificationPage() {
  if (!isVerificationEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdev%2Fverify");
  if (!DEV_USERS.some((account) => account.id === user.sub)) notFound();
  const response = await getVerificationActive();
  const workspace = response.ok
    ? VerificationWorkspaceSchema.parse(await response.json())
    : { active: null };
  return (
    <VerificationConsole
      initialActive={workspace.active}
      isOwner={user.sub === DEV_USERS[0].id}
    />
  );
}
