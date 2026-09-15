import { notFound, redirect } from "next/navigation";
import {
  RoomInfoResponseSchema,
  RoomMembersResponseSchema,
} from "@/contracts/api";
import { isUuid } from "@/contracts/ids";
import { isLobby } from "@/contracts/phase";
import type { ProtocolMember } from "@/contracts/room-protocol";
import { buildInviteUrl } from "@/features/invite";
import { RoomLobby } from "@/features/room";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
import { getBaseUrl } from "@/lib/session/env";

export const dynamic = "force-dynamic";

type StartPageProps = {
  params: Promise<{ id: string }>;
};

export default async function StartPage({ params }: StartPageProps) {
  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // セッション必須・メンバー必須（api-worker 側で判定、404 なら notFound）。
  const res = await apiFetch(`/api/rooms/${id}`);
  if (!res.ok) {
    notFound();
  }
  const parsed = RoomInfoResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    notFound();
  }

  // 既に課題整理を開始していればボードへ直行する。
  if (!isLobby(parsed.data.phase)) {
    redirect(`/rooms/${parsed.data.roomId}`);
  }

  // メンバー一覧を SSR で取得（初期表示用）。
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

  const inviteUrl = buildInviteUrl(getBaseUrl(), parsed.data.inviteCode);

  // 作成/参加直後の toast はホーム / 招待 URL 側クライアントが成功時に出し、
  // その後 router.push でこのスタート画面へ遷移する。
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col gap-6 overflow-hidden p-4">
      <div className="min-h-0 flex-1 overflow-hidden">
        <RoomLobby
          key={parsed.data.roomId}
          roomId={parsed.data.roomId}
          inviteCode={parsed.data.inviteCode}
          inviteUrl={inviteUrl}
          currentUserId={user.sub}
          isHost={parsed.data.isHost}
          hostUserId={parsed.data.hostUserId}
          initialPhase={parsed.data.phase}
          initialMembers={initialMembers}
        />
      </div>
    </main>
  );
}
