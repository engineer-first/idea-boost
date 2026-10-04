import { redirect } from "next/navigation";
import {
  isValidInviteCode,
  normalizeInviteCode,
} from "@/contracts/invite-code";
import { getLoginPath, sanitizeNextPath } from "@/features/auth";
import { InviteCodeDialog } from "@/features/room-lifecycle";
import { lookupRoomByInviteCode } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

export const dynamic = "force-dynamic";

type InvitePageProps = {
  params: Promise<{ inviteCode: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { inviteCode: raw } = await params;
  const invitePath = `/invite/${raw}`;
  const user = await getCurrentUser();

  // 未ログインは /login へ（戻り先 = 招待URL）。
  if (!user) {
    redirect(getLoginPath(sanitizeNextPath(invitePath)));
  }

  const code = normalizeInviteCode(raw);
  if (!isValidInviteCode(code)) {
    redirect(
      `/home?error=${encodeURIComponent("招待コードは英数字6桁で入力してください。")}`,
    );
  }

  const lookup = await lookupRoomByInviteCode(code);
  if (lookup.kind === "not_found") {
    redirect(
      `/home?error=${encodeURIComponent("ルームが見つかりませんでした。")}`,
    );
  }
  if (lookup.kind === "unavailable") {
    redirect(
      `/home?error=${encodeURIComponent("ルーム情報を取得できませんでした。しばらくしてから再度お試しください。")}`,
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
