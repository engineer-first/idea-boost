// 起動スクリプトが生成したローカル専用構成からだけ参照する入口。
// 本番 wrangler.jsonc の api-worker/RoomDO にはこのモジュールを含めない。
import {
  DEMO_HOST,
  DemoActionRequestSchema,
  DemoCreateRequestSchema,
} from "../contracts/demo";
import { type ApiWorkerEnv, createApiWorker } from "./api-worker";
import { deleteRoom, ensureUser, findRoomById, insertRoom } from "./lib/db";
import { DemoRoomDO } from "./room/demo-room-do";

export { DemoRoomDO };
export type DemoWorkerEnv = ApiWorkerEnv & {
  IDEA_BOOST_DEMO?: string;
  DEMO_CONTROL_TOKEN?: string;
};
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
const api = createApiWorker(async (request, env, session) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/demo/")) return null;
  if (session.sub !== DEMO_HOST.sub)
    return json({ error: "デモホストのみ操作できます。" }, 403);
  const namespace =
    env.ROOM_DO as unknown as DurableObjectNamespace<DemoRoomDO>;
  if (request.method === "POST" && url.pathname === "/api/demo/rooms") {
    const parsed = DemoCreateRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return json({ error: "見せ場を選んでください。" }, 400);
    await ensureUser(env.DB, {
      id: DEMO_HOST.sub,
      email: DEMO_HOST.email,
      name: DEMO_HOST.name,
    });
    const room = await insertRoom(env.DB, DEMO_HOST.sub);
    const stub = namespace.get(namespace.idFromName(room.roomId));
    try {
      await stub.initializeDemo(parsed.data.checkpoint);
    } catch {
      await deleteRoom(env.DB, room.roomId);
      await stub.disband();
      return json(
        { error: "デモの準備に失敗しました。もう一度お試しください。" },
        503,
      );
    }
    return json({ roomId: room.roomId, inviteCode: room.inviteCode });
  }
  const match = url.pathname.match(
    /^\/api\/demo\/rooms\/([0-9a-f-]{36})(\/actions)?$/,
  );
  if (!match) return json({ error: "デモルームが見つかりません。" }, 404);
  const room = await findRoomById(env.DB, match[1]);
  if (!room || room.hostId !== session.sub)
    return json({ error: "デモルームが見つかりません。" }, 404);
  const stub = namespace.get(namespace.idFromName(room.roomId));
  if (request.method === "GET" && !match[2]) {
    const status = await stub.demoStatus(session.sub);
    return status
      ? json(status)
      : json({ error: "デモルームが見つかりません。" }, 404);
  }
  if (request.method === "POST" && match[2]) {
    const parsed = DemoActionRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return json({ error: "操作の形式が不正です。" }, 400);
    try {
      const status = await stub.demoAction(session.sub, parsed.data);
      return status
        ? json(status)
        : json({ error: "デモルームが見つかりません。" }, 404);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "操作に失敗しました。",
        },
        409,
      );
    }
  }
  return json({ error: "not found" }, 404);
});
export default {
  async fetch(request: Request, env: DemoWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api/demo/") &&
      (env.IDEA_BOOST_DEMO !== "true" ||
        !env.DEMO_CONTROL_TOKEN ||
        env.DEMO_CONTROL_TOKEN.length < 32 ||
        request.headers.get("X-Demo-Control-Token") !==
          env.DEMO_CONTROL_TOKEN ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      return json({ error: "not found" }, 404);
    return api.fetch(request, env);
  },
};
