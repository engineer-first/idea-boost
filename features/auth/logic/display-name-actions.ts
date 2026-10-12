"use server";

import { revalidatePath } from "next/cache";
import {
  DisplayNameResponseSchema,
  type SetDisplayNameInput,
  SetDisplayNameInputSchema,
} from "@/contracts/display-name";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

export type DisplayNameResult =
  | { ok: true; name: string | null }
  | { ok: false; error: string };

export async function loadDisplayName(
  expectedPrincipal: string,
): Promise<DisplayNameResult> {
  const user = await getCurrentUser();
  if (!user || user.sub !== expectedPrincipal)
    return {
      ok: false,
      error: "ログイン状態が変わりました。再読み込みしてください。",
    };
  try {
    const response = await apiFetch("/api/me/display-name", {
      cache: "no-store",
    });
    const parsed = response.ok
      ? DisplayNameResponseSchema.safeParse(await response.json())
      : null;
    if (parsed?.success) return { ok: true, ...parsed.data };
  } catch {}
  return {
    ok: false,
    error: "表示名を取得できませんでした。通信を確認して再試行してください。",
  };
}
export async function saveDisplayName(
  input: SetDisplayNameInput,
): Promise<DisplayNameResult> {
  const parsed = SetDisplayNameInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const user = await getCurrentUser();
  if (!user || user.sub !== parsed.data.expectedPrincipal)
    return {
      ok: false,
      error: "ログイン状態が変わりました。再読み込みしてください。",
    };
  try {
    const response = await apiFetch("/api/me/display-name", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const body: unknown = await response.json();
    const result = response.ok
      ? DisplayNameResponseSchema.safeParse(body)
      : null;
    if (result?.success) {
      revalidatePath("/", "layout");
      return { ok: true, ...result.data };
    }
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    )
      return { ok: false, error: body.error };
  } catch {}
  return {
    ok: false,
    error:
      "保存結果を確認できませんでした。入力は残っています。もう一度保存してください。",
  };
}
