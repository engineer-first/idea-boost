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
import { RoomBoard, RoomEntryPreview } from "@/features/room";
import { RoomAdmissionGate } from "@/features/room-lifecycle";
import {
  isVerificationEnabled,
  VerificationFollower,
} from "@/features/verification";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

import { getRequestBaseUrl } from "@/lib/session/request-base-url";
import { hasRoomEntryTime } from "@/lib/session/room-entry";

export const dynamic = "force-dynamic";

type RoomPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ verify?: string; entry?: string; tab?: string }>;
};

export default async function RoomPage({
  params,
  searchParams,
}: RoomPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const follow = isVerificationEnabled() && query?.verify === "follow";
  const targetQuery = new URLSearchParams();
  if (follow) targetQuery.set("verify", "follow");
  if (query?.entry) targetQuery.set("entry", query.entry);
  const suffix = targetQuery.size ? `?${targetQuery}` : "";

  if (!isUuid(id)) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/rooms/${id}${suffix}`)}`);
  }

  // 完了時の閲覧権は退出後も残るため、現在の在籍より先に確認する。
  let completed: Response;
  try {
    completed = await apiFetch(`/api/completed-rooms/${id}`, {
      cache: "no-store",
    });
  } catch {
    redirect(`/completed-rooms/${id}`);
  }
  if (completed.ok) redirect(`/completed-rooms/${id}`);
  if (completed.status !== 404) {
    // 一時障害も再訪ページの再取得へ。作業用の本文や招待情報へfallbackしない。
    redirect(`/completed-rooms/${id}`);
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
    redirect(`/rooms/${parsed.data.roomId}/start${suffix}`);
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

  // 本番は設定値、Previewはgatewayが確認したPRのoriginから招待URLを作る。
  const inviteUrl = buildInviteUrl(
    await getRequestBaseUrl(),
    parsed.data.inviteCode,
  );

  // key={roomId} で、クライアント遷移（/rooms/A → /rooms/B）時に RoomBoard を
  // 強制的に再マウントする。これがないと notes state（や draggingNoteId）が
  // 旧ルームの値を保持し、新ルームの snapshot が届くまで旧データが表示される。
  const content = (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {follow && <VerificationFollower roomId={id} />}
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

  const enough = hasRoomEntryTime(user);
  if (!enough || query?.entry) {
    return (
      <RoomAdmissionGate
        key={`${user.sub}:${user.exp}:${id}:${query?.entry ?? "fresh"}`}
        roomId={id}
        fallback={
          <RoomEntryPreview
            phase={parsed.data.phase}
            members={initialMembers}
            currentUserId={user.sub}
            hostUserId={parsed.data.hostUserId}
            isHost={parsed.data.isHost}
            inviteCode={parsed.data.inviteCode}
            inviteUrl={inviteUrl}
          />
        }
        entryToken={query?.entry}
        allowFreshEntry={enough}
      >
        {content}
      </RoomAdmissionGate>
    );
  }
  return content;
}
