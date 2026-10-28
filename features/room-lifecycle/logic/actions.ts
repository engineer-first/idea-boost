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
  ROOM_CREATION_NAME_MAX,
} from "@/contracts/room-creation";
import type {
  ParticipationConfirmation,
  ParticipationResult,
} from "@/contracts/room-participation";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
import { issueRoomEntry } from "@/lib/session/room-entry";
import { prepareRoomEntrySession } from "@/lib/session/room-entry-session";
import {
  participationActionFailure,
  readParticipationRecovery,
} from "./participation-recovery";

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
      confirmation?: ParticipationConfirmation;
      pendingOperation?: Extract<ParticipationResult, { kind: "pending" }>;
      failedOperation?: Extract<ParticipationResult, { kind: "rejected" }>;
      reason?: string;
    };

export type JoinRoomResult =
  | { ok: true; roomId: string; entryToken?: string }
  | {
      ok: false;
      error: string;
      reason?: string;
      confirmation?: ParticipationConfirmation;
      pendingOperation?: Extract<ParticipationResult, { kind: "pending" }>;
      failedOperation?: Extract<ParticipationResult, { kind: "rejected" }>;
    };

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
      error: `作成要求IDと${ROOM_CREATION_NAME_MAX}文字以内のルーム名が必要です。`,
    };
  if (parsedInput.data.expectedPrincipal !== user.sub)
    return {
      ok: false,
      outcome: "rejected",
      reason: "actor_mismatch",
      error: "アカウントが変わりました。ログイン状態を確認してください。",
    };
  const prepared = await prepareRoomEntrySession(user);
  if (!prepared.ok)
    return {
      ok: false,
      outcome: "rejected",
      reason: prepared.reason,
      error:
        prepared.reason === "identity_unavailable"
          ? "このブラウザでは、以前の参加者として確認できませんでした。新しく始めると別の参加者になり、以前のホスト権限・付箋・投票は引き継がれません。"
          : prepared.reason === "retry"
            ? "通信を確認して、もう一度お試しください。"
            : "ログインし直して続けてください。",
    };
  try {
    const res = await apiFetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsedInput.data),
    });
    const recovery = await readParticipationRecovery(res);
    if (recovery) return participationActionFailure(recovery);
    if ([400, 401, 403, 409, 410].includes(res.status)) {
      const raw = await res.json().catch(() => null);
      const failure = CreationFailureSchema.safeParse(raw);
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
        entryToken: await issueRoomEntry(
          parsed.data.roomId,
          prepared.user,
          "lobby",
        ),
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

export async function joinRoom(
  formData: FormData,
  expectedPrincipal?: string,
): Promise<JoinRoomResult> {
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

  if (expectedPrincipal !== undefined && expectedPrincipal !== user.sub)
    return {
      ok: false,
      reason: "actor_mismatch",
      error: "アカウントが変わりました。元のアカウントでログインしてください。",
    };
  const prepared = await prepareRoomEntrySession(user);
  if (!prepared.ok)
    return {
      ok: false,
      reason: prepared.reason,
      error:
        prepared.reason === "identity_unavailable"
          ? "このブラウザでは、以前の参加者として確認できませんでした。新しく始めると別の参加者になり、以前のホスト権限・付箋・投票は引き継がれません。"
          : prepared.reason === "retry"
            ? "通信を確認して、もう一度お試しください。"
            : "ログインし直して続けてください。",
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

  const recovery = await readParticipationRecovery(res);
  if (recovery) return participationActionFailure(recovery);
  // 404/400 はルーム不存在・入力不正。それ以外の非 2xx は一時障害扱い。
  if (res.status === 404 || res.status === 400) {
    return {
      ok: false,
      error:
        "参加できるルームが見つかりません。ルームが終了したか、招待コードが無効な可能性があります。招待元に確認してください。",
    };
  }
  if (res.status === 409) {
    // 現行APIは終了と満員の両方に409を使う。既知の応答だけを案内し、
    // 不正・未知のボディから満員だと推測しない。
    const failure = z
      .object({ error: z.string() })
      .safeParse(await res.json().catch(() => null));
    if (
      failure.success &&
      failure.data.error === "終了したルームには参加できません。"
    ) {
      return {
        ok: false,
        error:
          "このルームは終了しているため参加できません。新しい招待コードをホストに確認してください。",
      };
    }
    if (
      failure.success &&
      failure.data.error === "このルームは20人までです。"
    ) {
      return {
        ok: false,
        error:
          "ルームが満員（上限20人）のため参加できません。ホストに確認してください。",
      };
    }
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
    entryToken: await issueRoomEntry(
      parsed.data.roomId,
      prepared.user,
      "lobby",
    ),
  };
}

export async function returnToRoom(
  roomId: string,
  expectedPrincipal?: string,
): Promise<ReturnToRoomResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (expectedPrincipal !== undefined && expectedPrincipal !== user.sub)
    return { kind: "unavailable_room" };
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
    const recovery = await readParticipationRecovery(response);
    if (recovery) return { kind: "ready", href: `/rooms/${roomId}` };
    if ([401, 403, 404].includes(response.status))
      return { kind: "unavailable_room" };
    if (!response.ok) return { kind: "retry" };
    const parsed = RoomInfoResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success || parsed.data.roomId !== roomId)
      return { kind: "retry" };
    const prepared = await prepareRoomEntrySession(user);
    if (!prepared.ok) return { kind: prepared.reason };
    const entryToken = await issueRoomEntry(
      roomId,
      prepared.user,
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
