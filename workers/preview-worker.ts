import {
  PreviewCreateRequestSchema,
  type PreviewRoom,
} from "../contracts/preview";
import { LoginAssertionSchema, TOKEN_AUDIENCE } from "../contracts/session";
import { verifyToken } from "../lib/session/token";
import { type ApiWorkerEnv, createApiWorker } from "./api-worker";
import { deleteRoom, ensureUser, insertRoom } from "./lib/db";
import { isPreviewEmailAllowed } from "./lib/preview-policy";
import { getSessionFromRequest } from "./lib/session";
import { requireSessionSecret } from "./lib/session-secret";
import { PreviewRoomDO } from "./room/preview-room-do";

export { PreviewRoomDO };
export type PreviewWorkerEnv = ApiWorkerEnv & {
  PREVIEW_ENABLED?: string;
  PREVIEW_ALLOWED_EMAILS?: string;
  PREVIEW_API_COMMIT?: string;
  PREVIEW_PROBE_TOKEN?: string;
};
const api = createApiWorker(async (request, baseEnv, session) => {
  if (new URL(request.url).pathname !== "/api/preview/rooms") return null;
  if (request.method !== "POST")
    return Response.json({ error: "method not allowed" }, { status: 405 });
  const parsed = PreviewCreateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "ステップを選んでください。" },
      { status: 400 },
    );
  await ensureUser(baseEnv.DB, {
    id: session.sub,
    email: session.email,
    name: session.name,
  });
  const room = await insertRoom(baseEnv.DB, session.sub);
  const namespace =
    baseEnv.ROOM_DO as unknown as DurableObjectNamespace<PreviewRoomDO>;
  const stub = namespace.get(namespace.idFromName(room.roomId));
  try {
    await stub.initializePreview(parsed.data.checkpoint, room.roomId, session);
    const result: PreviewRoom = {
      roomId: room.roomId,
      inviteCode: room.inviteCode,
      checkpoint: parsed.data.checkpoint,
    };
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    await deleteRoom(baseEnv.DB, room.roomId);
    await stub.disband();
    return Response.json(
      { error: "準備に失敗しました。新しいルームで再試行してください。" },
      { status: 503 },
    );
  }
});
export default {
  async fetch(request: Request, env: PreviewWorkerEnv): Promise<Response> {
    if (env.PREVIEW_ENABLED !== "true" || !env.PREVIEW_ALLOWED_EMAILS)
      return Response.json(
        { error: "Preview設定が未完了です。" },
        { status: 503 },
      );
    try {
      requireSessionSecret(env.SESSION_SECRET);
    } catch {
      return Response.json(
        { error: "Preview認証設定が未完了です。" },
        { status: 503 },
      );
    }
    const path = new URL(request.url).pathname;
    if (
      path === "/api/preview/health" &&
      request.method === "GET" &&
      env.PREVIEW_PROBE_TOKEN &&
      env.PREVIEW_PROBE_TOKEN.length >= 32 &&
      request.headers.get("X-Preview-Probe-Token") === env.PREVIEW_PROBE_TOKEN
    ) {
      await env.DB.prepare("SELECT 1").first();
      await env.ROOM_DO.get(
        env.ROOM_DO.idFromName("preview-health"),
      ).getPhase();
      return Response.json({
        ok: true,
        environment: "preview",
        apiCommit: env.PREVIEW_API_COMMIT ?? "unknown",
      });
    }
    if (path === "/api/auth/sync" && request.method === "POST") {
      const body: unknown = await request
        .clone()
        .json()
        .catch(() => null);
      const token =
        typeof body === "object" &&
        body !== null &&
        "assertion" in body &&
        typeof body.assertion === "string"
          ? body.assertion
          : "";
      const assertion = await verifyToken(token, LoginAssertionSchema, {
        secret: env.SESSION_SECRET,
        audience: TOKEN_AUDIENCE.loginAssertion,
      });
      if (!assertion)
        return Response.json({ error: "認証が必要です。" }, { status: 401 });
      if (
        assertion.kind !== "google" ||
        !isPreviewEmailAllowed(assertion.email, env.PREVIEW_ALLOWED_EMAILS)
      )
        return Response.json(
          { error: "許可されていません。" },
          { status: 403 },
        );
    } else {
      const session = await getSessionFromRequest(request, env.SESSION_SECRET);
      if (!session)
        return Response.json({ error: "認証が必要です。" }, { status: 401 });
      if (!isPreviewEmailAllowed(session.email, env.PREVIEW_ALLOWED_EMAILS))
        return Response.json(
          { error: "許可されていません。" },
          { status: 403 },
        );
      if (path === "/api/health")
        return Response.json({
          ok: true,
          environment: "preview",
          apiCommit: env.PREVIEW_API_COMMIT ?? "unknown",
        });
    }
    return api.fetch(request, env);
  },
  scheduled: api.scheduled,
};
