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
  type ReturnToRoomResult,
  RoomInfoResponseSchema,
} from "@/contracts/api";
import { CompletedRoomSchema } from "@/contracts/completed-rooms";
import { isUuid } from "@/contracts/ids";
import {
  isValidInviteCode,
  normalizeInviteCode,
} from "@/contracts/invite-code";
import { isLobby } from "@/contracts/phase";
import {
  CreationFailureSchema,
  type CreationIssued,
  CreationIssuedSchema,
  CreationPrincipalSchema,
  type CreationStatus,
  CreationStatusInputSchema,
  CreationStatusSchema,
} from "@/contracts/room-creation";
import { apiFetch, lookupRoomByInviteCode } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
import { hasRoomEntryTime, issueRoomEntry } from "@/lib/session/room-entry";

const JoinRoomInputSchema = z.object({
  code: z
    .string()
    .transform((value) => normalizeInviteCode(value))
    .refine((value) => isValidInviteCode(value), {
      message: "招待コードは英数字6桁で入力してください。",
    }),
});

// 作成/参加成功時はクライアントで toast と遷移を行う。作成再送の復帰先は現在の状態から確認する。
// （Server Action の redirect 後に toast する方式は、遷移でクライアント状態が
// 消えるため使わない）
export type CreateRoomResult =
  | { ok: true; roomId: string; entryToken?: string }
  | {
      ok: false;
      error: string;
      outcome: "unknown" | "rejected";
      reason?: string;
    };

export type JoinRoomResult =
  | { ok: true; roomId: string; entryToken?: string }
  | { ok: false; error: string; reason?: string };

// 参加確認 Dialog 用。ホスト名を先に解決し、存在しないコードは Dialog を開かない。
export type LookupInviteResult =
  | { ok: true; hostName: string; inviteCode: string }
  | { ok: false; error: string; reason?: string };

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

export async function createRoom(
  input: z.infer<typeof CreateRoomInputSchema>,
): Promise<CreateRoomResult> {
  const user = await getCurrentUser();
  if (!user)
    return {
      ok: false,
      outcome: "rejected",
      error: "ログインしてから同じ作成を再試行してください。",
    };
  const parsedInput = CreateRoomInputSchema.safeParse(input);
  if (!parsedInput.success)
    return {
      ok: false,
      outcome: "rejected",
      error: "作成要求IDと80文字以内のルーム名が必要です。",
    };
  if (parsedInput.data.expectedPrincipal !== user.sub)
    return {
      ok: false,
      outcome: "rejected",
      reason: "actor_mismatch",
      error: "アカウントが変わりました。ログイン状態を確認してください。",
    };
  if (!hasRoomEntryTime(user))
    return {
      ok: false,
      outcome: "rejected",
      reason: "reauth_required",
      error: "ログインし直して続けてください。",
    };
  try {
    const res = await apiFetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsedInput.data),
    });
    if ([400, 401, 403, 409, 410].includes(res.status)) {
      const failure = CreationFailureSchema.safeParse(
        await res.json().catch(() => null),
      );
      return {
        ok: false,
        outcome: "rejected",
        reason: failure.success ? failure.data.reason : "invalid_request",
        error: failure.success
          ? failure.data.error
          : "作成要求を受け付けられませんでした。ログイン状態と入力を確認してください。",
      };
    }
    const parsed = res.ok
      ? CreateRoomResponseSchema.safeParse(await res.json().catch(() => null))
      : null;
    if (parsed?.success)
      return {
        ok: true,
        roomId: parsed.data.roomId,
        entryToken: await issueRoomEntry(parsed.data.roomId, user, "lobby"),
      };
  } catch {
    // 送信後の通信失敗では成功・失敗を決めない。
  }
  return {
    ok: false,
    outcome: "unknown",
    error: "作成結果を確認できません。同じ作成を確認・再試行してください。",
  };
}

type CreationActionFailure = { ok: false; error: string; reason?: string };
export async function issueRoomCreation(
  expectedPrincipal: string,
): Promise<{ ok: true; issued: CreationIssued } | CreationActionFailure> {
  const parsed = CreationPrincipalSchema.safeParse({ expectedPrincipal });
  const user = await getCurrentUser();
  if (!user || !parsed.success)
    return { ok: false, error: "ログイン状態を確認してください。" };
  if (user.sub !== expectedPrincipal)
    return {
      ok: false,
      error: "アカウントが変わりました。",
      reason: "actor_mismatch",
    };
  try {
    const response = await apiFetch("/api/room-creations/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const raw = await response.json().catch(() => null);
    const issued = response.ok ? CreationIssuedSchema.safeParse(raw) : null;
    if (issued?.success) return { ok: true, issued: issued.data };
    const failure = CreationFailureSchema.safeParse(raw);
    if (failure.success) return { ok: false, ...failure.data };
  } catch {}
  return {
    ok: false,
    error: "作成の準備を確認できません。もう一度お試しください。",
  };
}
export async function queryRoomCreation(
  expectedPrincipal: string,
  requestId: string,
): Promise<{ ok: true; status: CreationStatus } | CreationActionFailure> {
  const parsed = CreationStatusInputSchema.safeParse({
    expectedPrincipal,
    requestId,
  });
  const user = await getCurrentUser();
  if (!user || !parsed.success)
    return { ok: false, error: "ログイン状態と控えを確認してください。" };
  if (user.sub !== expectedPrincipal)
    return {
      ok: false,
      error: "アカウントが変わりました。",
      reason: "actor_mismatch",
    };
  try {
    const response = await apiFetch(
      `/api/room-creations/${parsed.data.requestId}?expectedPrincipal=${encodeURIComponent(expectedPrincipal)}`,
    );
    const raw = await response.json().catch(() => null);
    const status = response.ok ? CreationStatusSchema.safeParse(raw) : null;
    if (status?.success) return { ok: true, status: status.data };
    const failure = CreationFailureSchema.safeParse(raw);
    if (failure.success) return { ok: false, ...failure.data };
  } catch {}
  return {
    ok: false,
    error: "結果を確認できません。控えを残して後で再度確認してください。",
  };
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

  if (!hasRoomEntryTime(user))
    return {
      ok: false,
      reason: "reauth_required",
      error: "ログインし直して続けてください。",
    };
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
  return {
    ok: true,
    roomId: parsed.data.roomId,
    entryToken: await issueRoomEntry(parsed.data.roomId, user, "lobby"),
  };
}

export async function returnToRoom(
  roomId: string,
): Promise<ReturnToRoomResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isUuid(roomId)) return { kind: "unavailable_room" };
  try {
    // 途中退出でも成果の閲覧権が残る場合があるため、在籍より先に確認する。
    const completed = await apiFetch(`/api/completed-rooms/${roomId}`, {
      cache: "no-store",
    });
    if (completed.ok) {
      const parsed = CompletedRoomSchema.safeParse(
        await completed.json().catch(() => null),
      );
      return parsed.success && parsed.data.roomId === roomId
        ? { kind: "ready", href: `/completed-rooms/${roomId}` }
        : { kind: "retry" };
    }
    if (completed.status === 401 || completed.status === 403)
      return { kind: "unavailable_room" };
    if (completed.status !== 404) return { kind: "retry" };
    const response = await apiFetch(`/api/rooms/${roomId}`, {
      cache: "no-store",
    });
    if ([401, 403, 404].includes(response.status))
      return { kind: "unavailable_room" };
    if (!response.ok) return { kind: "retry" };
    const parsed = RoomInfoResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success || parsed.data.roomId !== roomId)
      return { kind: "retry" };
    if (!hasRoomEntryTime(user)) return { kind: "reauth_required" };
    const entryToken = await issueRoomEntry(
      roomId,
      user,
      isLobby(parsed.data.phase) ? "lobby" : "board",
    );
    return {
      kind: "ready",
      href: `/rooms/${roomId}${isLobby(parsed.data.phase) ? "/start" : ""}`,
      entryToken,
    };
  } catch {
    return { kind: "retry" };
  }
}
