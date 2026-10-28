"use server";
import {
  ParticipationCommitSchema,
  type ParticipationResult,
  ParticipationResultSchema,
} from "@/contracts/room-participation";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
import { issueRoomEntry } from "@/lib/session/room-entry";
import { prepareRoomEntrySession } from "@/lib/session/room-entry-session";
export type ParticipationActionResult = ParticipationResult & {
  entryToken?: string;
};
async function requestParticipation(
  path: string,
  expectedPrincipal: string,
  body?: unknown,
): Promise<ParticipationActionResult> {
  const user = await getCurrentUser();
  if (!user || user.sub !== expectedPrincipal)
    return {
      kind: "rejected",
      reason: "actor_mismatch",
      error: "アカウントが変わりました。ログイン状態を確認してください。",
    };
  const prepared = await prepareRoomEntrySession(user);
  if (!prepared.ok)
    return {
      kind: "rejected",
      reason: prepared.reason,
      error:
        prepared.reason === "identity_unavailable"
          ? "このブラウザでは、以前の参加者として確認できませんでした。新しく始めると別の参加者になり、以前のホスト権限・付箋・投票は引き継がれません。"
          : prepared.reason === "retry"
            ? "通信を確認して、もう一度お試しください。"
            : "ログインし直して続けてください。",
    };
  const response = await apiFetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = ParticipationResultSchema.parse(await response.json());
  return result.kind === "ready"
    ? {
        ...result,
        entryToken: await issueRoomEntry(result.roomId, prepared.user, "lobby"),
      }
    : result;
}
export async function commitParticipation(
  operationId: string,
  expectedPrincipal: string,
  outcomeAccess: "retain" | "discard",
  confirmationVersion: number,
): Promise<ParticipationActionResult> {
  const body = ParticipationCommitSchema.parse({
    operationId,
    expectedPrincipal,
    outcomeAccess,
    confirmationVersion,
  });
  return requestParticipation(
    "/api/room-participation/commit",
    expectedPrincipal,
    body,
  );
}
export async function queryParticipation(
  operationId: string,
  expectedPrincipal: string,
): Promise<ParticipationActionResult> {
  if (
    !ParticipationCommitSchema.omit({
      outcomeAccess: true,
      confirmationVersion: true,
    }).safeParse({ operationId, expectedPrincipal }).success
  )
    return {
      kind: "rejected",
      reason: "invalid_request",
      error: "確認内容を読み直してください。",
    };
  return requestParticipation(
    `/api/room-participation/${operationId}?expectedPrincipal=${encodeURIComponent(expectedPrincipal)}`,
    expectedPrincipal,
  );
}
