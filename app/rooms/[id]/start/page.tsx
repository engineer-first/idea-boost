import { notFound, redirect } from "next/navigation";
import {
  RoomInfoResponseSchema,
  RoomMembersResponseSchema,
} from "@/contracts/api";
import { isUuid } from "@/contracts/ids";
import { isLobby } from "@/contracts/phase";
import type { ProtocolMember } from "@/contracts/room-protocol";
import { buildInviteUrl } from "@/features/invite";
import { RoomEntryPreview, RoomLobby } from "@/features/room";
import { RoomAdmissionGate } from "@/features/room-lifecycle";
import {
  isVerificationEnabled,
  VerificationFollower,
} from "@/features/verification";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

import { getRequestBaseUrl } from "@/lib/session/request-base-url";
import { hasRoomEntryTime, issueRoomEntry } from "@/lib/session/room-entry";

export const dynamic = "force-dynamic";

type StartPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ verify?: string; entry?: string; tab?: string }>;
};

export default async function StartPage({
  params,
  searchParams,
}: StartPageProps) {
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
    redirect(`/rooms/${parsed.data.roomId}${suffix}`);
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

  const inviteUrl = buildInviteUrl(
    await getRequestBaseUrl(),
    parsed.data.inviteCode,
  );

  // 作成/参加直後の toast はホーム / 招待 URL 側クライアントが成功時に出し、
  // その後 router.push でこのスタート画面へ遷移する。
  const enough = hasRoomEntryTime(user);
  const admission = enough
    ? await issueRoomEntry(id, user, "board")
    : undefined;
  const content = (
    <main className="flex h-full min-h-0 flex-1 flex-col gap-6 overflow-hidden p-4">
      {follow && <VerificationFollower roomId={id} />}
      <div className="min-h-0 flex-1 overflow-hidden">
        <RoomLobby
          key={parsed.data.roomId}
          roomId={parsed.data.roomId}
          entryAdmission={admission}
          boardHref={follow ? `/rooms/${id}${suffix}` : undefined}
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
        stage="lobby"
        entryToken={query?.entry}
        allowFreshEntry={enough}
        freshAdmission={admission}
      >
        {content}
      </RoomAdmissionGate>
    );
  }
  return content;
}
