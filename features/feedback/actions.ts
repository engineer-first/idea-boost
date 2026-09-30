"use server";
import { FeedbackInputSchema, type FeedbackResult } from "@/contracts/feedback";
import { isUuid } from "@/contracts/ids";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

export async function submitFeedback(
  roomId: string,
  input: unknown,
): Promise<FeedbackResult> {
  if (!(await getCurrentUser()))
    return {
      ok: false,
      error: "ログインが切れています。ログインし直してから送信してください。",
    };
  const parsed = FeedbackInputSchema.safeParse(input);
  if (!isUuid(roomId) || !parsed.success)
    return { ok: false, error: "入力内容を確認してください。" };
  try {
    const response = await apiFetch(`/api/rooms/${roomId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
    });
    if (!response.ok)
      return {
        ok: false,
        retryWithNewId: response.status === 409,
        error:
          response.status === 401
            ? "ログインし直してから送信してください。"
            : response.status === 404
              ? "参加中のルームを確認できません。退出・解散後は送信できません。"
              : response.status === 409
                ? "この受付IDでは送信できません。端末の日時を確認し、下のボタンで新しい意見として送信してください。"
                : "送信できませんでした。入力は残っています。もう一度送信してください。",
      };
    return { ok: true, id: parsed.data.id };
  } catch {
    return {
      ok: false,
      error:
        "送信できませんでした。入力は残っています。接続を確認して再送してください。",
    };
  }
}
