import {
  ParticipationConfirmationSchema,
  type ParticipationResult,
  ParticipationResultSchema,
} from "@/contracts/room-participation";
export type ParticipationRecovery = Exclude<
  ParticipationResult,
  { kind: "ready" }
>;
/** Legacy参加APIと参加操作APIの、認証済みエラー応答だけを復帰情報へ変換する。 */
export async function readParticipationRecovery(
  response: Response,
): Promise<ParticipationRecovery | null> {
  if (![409, 410, 503].includes(response.status)) return null;
  const raw: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const parsed = ParticipationResultSchema.safeParse(raw);
  if (parsed.success && parsed.data.kind !== "ready") return parsed.data;
  const confirmation = ParticipationConfirmationSchema.safeParse(
    typeof raw === "object" && raw !== null && "confirmation" in raw
      ? raw.confirmation
      : null,
  );
  return confirmation.success
    ? { kind: "confirmation", confirmation: confirmation.data }
    : null;
}
export function participationActionFailure(result: ParticipationRecovery) {
  if (result.kind === "pending")
    return {
      ok: false as const,
      outcome: "unknown" as const,
      pendingOperation: result,
      error: "ルームに移動できませんでした。もう一度お試しください。",
    };
  if (result.kind === "confirmation")
    return {
      ok: false as const,
      outcome: "rejected" as const,
      reason: "confirmation_required",
      error: "ルームに移動しています。",
      confirmation: result.confirmation,
    };
  return {
    ok: false as const,
    outcome: "rejected" as const,
    reason: result.reason,
    error: "ルームに移動できませんでした。もう一度お試しください。",
    failedOperation: result.failure ? result : undefined,
  };
}
