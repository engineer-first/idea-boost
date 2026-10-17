import { isUuid } from "../contracts/ids";
import {
  ParticipationCommitSchema,
  ParticipationPrepareSchema,
  type ParticipationResult,
} from "../contracts/room-participation";
import type { VerifiedSession } from "../contracts/session";
import type { ApiWorkerEnv } from "./api-worker";
import { ensureUser } from "./lib/db";
export function accountStub(env: ApiWorkerEnv, userId: string) {
  return env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(userId));
}
export function participationResponse(
  result: ParticipationResult,
  legacy = false,
): Response {
  const status =
    result.kind === "ready"
      ? 200
      : result.kind === "rejected"
        ? ["closed", "expired"].includes(result.reason)
          ? 410
          : result.reason === "update_required"
            ? 400
            : 409
        : legacy
          ? result.kind === "pending"
            ? 503
            : 409
          : 200;
  const body =
    legacy && result.kind === "confirmation"
      ? {
          reason: "confirmation_required",
          error: "元ルームの退出を確認してください。",
          confirmation: result.confirmation,
        }
      : legacy && result.kind === "ready"
        ? {
            roomId: result.roomId,
            ...(result.inviteCode ? { inviteCode: result.inviteCode } : {}),
          }
        : result;
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function handleRoomParticipation(
  request: Request,
  env: ApiWorkerEnv,
  session: VerifiedSession,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const stub = accountStub(env, session.sub);
  const read = request.method === "GET" && isUuid(path.split("/").pop() ?? "");
  const write =
    request.method === "POST" &&
    [
      "/api/room-participation/prepare",
      "/api/room-participation/commit",
    ].includes(path);
  if (!read && !write)
    return Response.json(
      { error: "この操作は利用できません。" },
      { status: 405 },
    );
  if (read) {
    const id = path.split("/").pop() ?? "";
    return participationResponse(await stub.status(session.sub, id));
  }
  const raw = await request.json().catch(() => null);
  const parsed = path.endsWith("/prepare")
    ? ParticipationPrepareSchema.safeParse(raw)
    : ParticipationCommitSchema.safeParse(raw);
  if (!parsed.success)
    return Response.json({ error: "移動要求が不正です。" }, { status: 400 });
  if (parsed.data.expectedPrincipal !== session.sub)
    return Response.json(
      { error: "アカウントが変わりました。" },
      { status: 403 },
    );
  if (
    "target" in parsed.data &&
    parsed.data.target.kind === "create" &&
    parsed.data.target.input.expectedPrincipal !== session.sub
  )
    return Response.json(
      { error: "アカウントが変わりました。" },
      { status: 403 },
    );
  await ensureUser(env.DB, {
    id: session.sub,
    email: session.email,
    name: session.name,
  });
  return participationResponse(
    "target" in parsed.data
      ? await stub.prepare(session.sub, parsed.data.target)
      : await stub.commit(
          session.sub,
          parsed.data.operationId,
          parsed.data.outcomeAccess,
          parsed.data.confirmationVersion,
        ),
  );
}
