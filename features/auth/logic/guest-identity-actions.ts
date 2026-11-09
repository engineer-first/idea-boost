"use server";

import {
  type GuestIdentityInput,
  GuestIdentityInputSchema,
} from "@/contracts/session";
import { getCurrentUser } from "@/lib/session/current-user";
import { isAuthConfigured } from "@/lib/session/env";
import { establishSession } from "@/lib/session/establish";

import {
  guestIdentityFailure,
  guestIdentityUnavailable,
} from "./guest-identity-copy";

export type PreparedPrincipal = { userId: string; kind: "guest" | "account" };
export type PrepareGuestIdentityResult =
  | { ok: true; principal: PreparedPrincipal; reused: boolean }
  | { ok: false; error: string };

export async function prepareGuestIdentity(
  input: GuestIdentityInput,
): Promise<PrepareGuestIdentityResult> {
  if (!isAuthConfigured())
    return { ok: false, error: guestIdentityUnavailable };
  const current = await getCurrentUser();
  if (current)
    return {
      ok: true,
      principal: { userId: current.sub, kind: current.kind },
      reused: true,
    };

  const parsed = GuestIdentityInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };

  const userId = crypto.randomUUID();
  try {
    const result = await establishSession({
      kind: "guest",
      userId,
      displayName: parsed.data.name,
    });
    if (result.ok) {
      // Cookie 発行で本人を反映する。遷移・再取得は呼出元が担うため、
      // 表示名更新時のような全 layout の revalidatePath はここでは行わない。
      return { ok: true, principal: { userId, kind: "guest" }, reused: false };
    }
  } catch {}
  return {
    ok: false,
    error: guestIdentityFailure,
  };
}
