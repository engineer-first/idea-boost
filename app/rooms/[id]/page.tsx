import { notFound, redirect } from "next/navigation";
import {
  RoomInfoResponseSchema,
  RoomMembersResponseSchema,
} from "@/contracts/api";
import { isUuid } from "@/contracts/ids";
import { isLobby } from "@/contracts/phase";
import type { ProtocolMember } from "@/contracts/room-protocol";
import { signOut } from "@/features/auth";
import { buildInviteUrl } from "@/features/invite";
import { RoomBoard } from "@/features/room";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
import { getBaseUrl } from "@/lib/session/env";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{ id: string }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // メンバーシップは api-worker（の先の RoomDO）が判定する。
  // 非メンバー・存在しないルームはどちらも 404 で返るため、そのまま notFound() へ。
  const res = await apiFetch(`/api/rooms/${id}`);
  if (!res.ok) {
    notFound();
  }

  const parsed = RoomInfoResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    notFound();
  }

  // lobby 状態なら付箋画面に直行させず、スタート画面へ誘導する。
  // 課題整理の全ステップはボードを直接開く。
  if (isLobby(parsed.data.phase)) {
    redirect(`/rooms/${parsed.data.roomId}/start`);
  }

  // メンバー一覧を SSR で取得して初回描画時の flicker を抑える。
  // 非 2xx・不正ボディ・ネットワーク障害でも snapshot で復元できるので空配列へ。
  let initialMembers: ProtocolMember[] = [];
  try {
    const membersRes = await apiFetch(`/api/rooms/${id}/members`);
    const membersParsed = membersRes.ok
      ? RoomMembersResponseSchema.safeParse(
          await membersRes.json().catch(() => null),
        )
      : null;
    if (membersParsed?.success) {
      initialMembers = membersParsed.data.members;
    }
  } catch {
    initialMembers = [];
  }

  // 招待URL の origin は設定値（NEXT_PUBLIC_SITE_URL、本番では必須）から作る。
  const inviteUrl = buildInviteUrl(getBaseUrl(), parsed.data.inviteCode);

  // key={roomId} で、クライアント遷移（/rooms/A → /rooms/B）時に RoomBoard を
  // 強制的に再マウントする。これがないと notes state（や draggingNoteId）が
  // 旧ルームの値を保持し、新ルームの snapshot が届くまで旧データが表示される。
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <RoomBoard
          key={parsed.data.roomId}
          roomId={parsed.data.roomId}
          inviteCode={parsed.data.inviteCode}
          inviteUrl={inviteUrl}
          currentUserId={user.sub}
          isHost={parsed.data.isHost}
          hostUserId={parsed.data.hostUserId}
          initialMembers={initialMembers}
          initialPhase={parsed.data.phase}
          signOutAction={signOut}
        />
      </div>
    </main>
  );
}
