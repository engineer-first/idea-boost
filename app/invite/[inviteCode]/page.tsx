import {
  isValidInviteCode,
  normalizeInviteCode,
} from "@/contracts/invite-code";
import {
  InviteCodeDialog,
  InviteGuestName,
  InviteStatusView,
} from "@/features/room-lifecycle";
import { lookupRoomByInviteCode } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

export const dynamic = "force-dynamic";

type InvitePageProps = {
  params: Promise<{ inviteCode: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { inviteCode: raw } = await params;
  const code = normalizeInviteCode(raw);
  if (!isValidInviteCode(code)) {
    return <InviteStatusView kind="invalid" />;
  }

  const user = await getCurrentUser();
  if (!user) {
    return <InviteGuestName inviteCode={code} />;
  }

  const lookup = await lookupRoomByInviteCode(code);
  if (lookup.kind === "not_found" || lookup.kind === "ended") {
    return <InviteStatusView kind={lookup.kind} />;
  }
  if (lookup.kind === "unavailable") {
    return (
      <InviteStatusView kind="unavailable" retryHref={`/invite/${code}`} />
    );
  }

  return (
    <InviteCodeDialog
      currentUserId={user.sub}
      inviteCode={lookup.room.inviteCode}
      hostName={lookup.room.hostName}
    />
  );
}
