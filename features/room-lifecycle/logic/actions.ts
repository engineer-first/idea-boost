"use server";

// ルーム作成/参加の Server Actions 境界。
// 実体は api-worker（D1 + RoomDO）へ委譲し、ここでは
// 「認証されているか」「入力形式が正しいか」だけを検証する。
// 退出はルーム内のフロー（features/room/actions.ts）。付箋の操作は
// Server Actions ではなく、ルーム内 WebSocket プロトコル
// （contracts/room-protocol.ts + lib/room-client）で行う。

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  CreateRoomInputSchema,
  CreateRoomResponseSchema,
  JoinRoomResponseSchema,
} from "@/contracts/api";
import {
  isValidInviteCode,
  normalizeInviteCode,
} from "@/contracts/invite-code";
import { apiFetch, lookupRoomByInviteCode } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

const JoinRoomInputSchema = z.object({
  code: z
    .string()
    .transform((value) => normalizeInviteCode(value))
    .refine((value) => isValidInviteCode(value), {
      message: "招待コードは英数字6桁で入力してください。",
    }),
});

// 作成/参加成功時はクライアントで toast → start へ遷移する。
// （Server Action の redirect 後に toast する方式は、遷移でクライアント状態が
// 消えるため使わない）
export type CreateRoomResult =
  | { ok: true; roomId: string }
  | { ok: false; error: string };

export type JoinRoomResult =
  | { ok: true; roomId: string }
  | { ok: false; error: string };

// 参加確認 Dialog 用。ホスト名を先に解決し、存在しないコードは Dialog を開かない。
export type LookupInviteResult =
  | { ok: true; hostName: string; inviteCode: string }
  | { ok: false; error: string };

export async function lookupInviteRoom(
  code: string,
): Promise<LookupInviteResult> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const parsedInput = JoinRoomInputSchema.safeParse({ code });
  if (!parsedInput.success) {
    return {
      ok: false,
      error: "招待コードは英数字6桁で入力してください。",
    };
  }

  const lookup = await lookupRoomByInviteCode(parsedInput.data.code);
  if (lookup.kind === "not_found") {
    return { ok: false, error: "ルームが見つかりませんでした。" };
  }
  if (lookup.kind === "unavailable") {
    return {
      ok: false,
      error:
        "ルーム情報を取得できませんでした。しばらくしてから再度お試しください。",
    };
  }

  return {
    ok: true,
    hostName: lookup.room.hostName,
    inviteCode: lookup.room.inviteCode,
  };
}

export async function createRoom(name?: string): Promise<CreateRoomResult> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const input = CreateRoomInputSchema.safeParse({ name });
  if (!input.success)
    return { ok: false, error: "ルーム名は80文字以内で入力してください。" };
  const res = await apiFetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.data),
  });
  // 2xx でもボディが不正 JSON（プロキシの HTML エラーページ等）のことがある。
  const parsed = res.ok
    ? CreateRoomResponseSchema.safeParse(await res.json().catch(() => null))
    : null;

  if (!parsed?.success) {
    return { ok: false, error: "ルームを作成できませんでした。" };
  }

  // 作成直後は lobby 状態なので、ボードではなくスタート画面へ遷移する。
  // 遷移と「ルームを作成しました」toast は呼び出し側クライアントが行う。
  return { ok: true, roomId: parsed.data.roomId };
}

export async function joinRoom(formData: FormData): Promise<JoinRoomResult> {
  const parsedInput = JoinRoomInputSchema.safeParse({
    code: String(formData.get("code") ?? ""),
  });

  if (!parsedInput.success) {
    return {
      ok: false,
      error: "招待コードは英数字6桁で入力してください。",
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  let res: Response;
  try {
    res = await apiFetch("/api/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: parsedInput.data.code }),
    });
  } catch {
    // タイムアウト・ネットワーク障害は「見つからない」と誤案内しない。
    return {
      ok: false,
      error:
        "ルームに参加できませんでした。しばらくしてから再度お試しください。",
    };
  }

  // 404/400 はルーム不存在・入力不正。それ以外の非 2xx は一時障害扱い。
  if (res.status === 404 || res.status === 400) {
    return { ok: false, error: "ルームが見つかりませんでした。" };
  }
  if (res.status === 409) {
    return { ok: false, error: "このルームは20人までです。" };
  }
  if (!res.ok) {
    return {
      ok: false,
      error:
        "ルームに参加できませんでした。しばらくしてから再度お試しください。",
    };
  }

  const parsed = JoinRoomResponseSchema.safeParse(
    await res.json().catch(() => null),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "ルームに参加できませんでした。しばらくしてから再度お試しください。",
    };
  }

  // 参加したらボードではなくスタート画面へ遷移する。
  // 遷移と「ルームに参加しました」toast は呼び出し側クライアントが行う。
  return { ok: true, roomId: parsed.data.roomId };
}
