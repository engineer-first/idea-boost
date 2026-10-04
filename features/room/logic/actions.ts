"use server";

// ルーム内から呼ばれる Server Actions 境界（退出 / 解散）。
// 実体は api-worker（D1 + RoomDO）へ委譲し、ここでは
// 「認証されているか」「入力形式が正しいか」だけを検証する。
// 作成・参加はルーム外のフロー（features/room-lifecycle/actions.ts）。

import { redirect } from "next/navigation";
import { LeaveRoomRequestSchema } from "@/contracts/completed-rooms";
import { isUuid } from "@/contracts/ids";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

// 退室機能。
// roomId を hidden フィールド経由で受け取る（Server Action のフォーム送信）。
// 未ログインは /login へ、ルーム未存在は / へリダイレクト。
// 実処理は api-worker の POST /api/rooms/:id/leave へ委譲する。
export async function leaveRoom(formData: FormData): Promise<void> {
  const roomId = String(formData.get("roomId") ?? "");

  if (!isUuid(roomId)) {
    redirect("/home");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // 404（既に退出済み / 存在しない / 非メンバー / 解散済み）は成功相当でホームへ。
  // ホストの leave はサーバ側でルーム解散になる。
  // 5xx は呼び出し側でリカバリする。
  const intent = formData.get("intent");
  const revision = formData.get("expectedHostRevision");
  const outcomeAccess = formData.get("outcomeAccess");
  const body = LeaveRoomRequestSchema.parse({
    ...(intent ? { intent } : {}),
    ...(outcomeAccess !== null ? { outcomeAccess } : {}),
    ...(revision !== null ? { expectedHostRevision: Number(revision) } : {}),
  });
  const res = await apiFetch(`/api/rooms/${roomId}/leave`, {
    method: "POST",
    ...(intent || outcomeAccess !== null
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });

  if (res.status === 404) {
    // 既に退出済み（または解散済み）— ホームに戻す
    redirect("/home");
  }
  if (!res.ok) {
    throw new Error(`ルーム退出 API が失敗しました: ${res.status}`);
  }

  redirect("/home");
}
