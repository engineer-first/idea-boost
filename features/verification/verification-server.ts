import type { z } from "zod";
import { isUuid } from "@/contracts/ids";
import {
  VerificationActiveSchema,
  VerificationCreateRequestSchema,
  VerificationStatusSchema,
  VerificationVoteRequestSchema,
  VerificationWorkspaceSchema,
} from "@/contracts/verification";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";
import { DEV_USERS } from "@/lib/session/dev-users";

export function isVerificationEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.IDEA_BOOST_VERIFY === "true" &&
    (process.env.VERIFICATION_CONTROL_TOKEN?.length ?? 0) >= 32
  );
}
function error(status: number): Response {
  return Response.json(
    {
      error:
        status === 503
          ? "検証環境との通信に失敗しました。再取得してください。"
          : "検証操作を実行できません。ログインと現在の状態を確認してください。",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
async function authorize(ownerOnly: boolean): Promise<Response | null> {
  if (!isVerificationEnabled()) return error(404);
  const user = await getCurrentUser();
  if (!user) return error(401);
  if (
    !DEV_USERS.some((account) => account.id === user.sub) ||
    (ownerOnly && user.sub !== DEV_USERS[0].id)
  )
    return error(403);
  return null;
}
async function proxy<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<Response> {
  try {
    const response = await apiFetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Verification-Control-Token":
          process.env.VERIFICATION_CONTROL_TOKEN ?? "",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
    if (!response.ok) return error(response.status);
    const parsed = schema.safeParse(await response.json());
    return parsed.success
      ? Response.json(parsed.data, { headers: { "Cache-Control": "no-store" } })
      : error(503);
  } catch {
    return error(503);
  }
}
export async function getVerificationActive(): Promise<Response> {
  return (
    (await authorize(false)) ??
    proxy("/api/verification/active", VerificationWorkspaceSchema)
  );
}
export async function createVerification(request: Request): Promise<Response> {
  const denied = await authorize(true);
  if (denied) return denied;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return error(403);
  const parsed = VerificationCreateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  return parsed.success
    ? proxy("/api/verification/rooms", VerificationActiveSchema, parsed.data)
    : error(400);
}
export async function getVerificationStatus(id: string): Promise<Response> {
  if (!isUuid(id)) return error(404);
  return (
    (await authorize(false)) ??
    proxy(`/api/verification/rooms/${id}`, VerificationStatusSchema)
  );
}
export async function completeVerificationVotes(
  request: Request,
  id: string,
): Promise<Response> {
  const denied = await authorize(true);
  if (denied) return denied;
  if (!isUuid(id)) return error(404);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return error(403);
  const parsed = VerificationVoteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  return parsed.success
    ? proxy(
        `/api/verification/rooms/${id}/vote`,
        VerificationStatusSchema,
        parsed.data,
      )
    : error(400);
}
