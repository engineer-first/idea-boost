import {
  VerificationCreateRequestSchema,
  VerificationVoteRequestSchema,
} from "../contracts/verification";
import { DEV_USERS } from "../lib/session/dev-users";
import { type ApiWorkerEnv, createApiWorker } from "./api-worker";
import { deleteRoom, ensureUser, findRoomById, insertRoom } from "./lib/db";
import { VerificationRoomDO } from "./room/verification-room-do";
import { VerificationWorkspace } from "./verification-workspace";

export { VerificationRoomDO, VerificationWorkspace };
export type VerificationWorkerEnv = ApiWorkerEnv & {
  IDEA_BOOST_VERIFY?: string;
  VERIFICATION_CONTROL_TOKEN?: string;
  VERIFICATION_WORKSPACE?: DurableObjectNamespace<VerificationWorkspace>;
};
const api = createApiWorker(async (request, baseEnv, session) => {
  const env = baseEnv as VerificationWorkerEnv;
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/verification/")) return null;
  if (!DEV_USERS.some((user) => user.id === session.sub))
    return Response.json(
      { error: "検証アカウントでログインしてください。" },
      { status: 403 },
    );
  const workspace = env.VERIFICATION_WORKSPACE?.get(
    env.VERIFICATION_WORKSPACE.idFromName("active"),
  );
  if (!workspace)
    return Response.json(
      { error: "検証環境が起動していません。" },
      { status: 503 },
    );
  if (request.method === "GET" && path === "/api/verification/active")
    return Response.json({ active: await workspace.getActive() });
  const namespace =
    env.ROOM_DO as unknown as DurableObjectNamespace<VerificationRoomDO>;
  if (request.method === "POST" && session.sub !== DEV_USERS[0].id)
    return Response.json({ error: "Ownerのみ操作できます。" }, { status: 403 });
  if (request.method === "POST" && path === "/api/verification/rooms") {
    const parsed = VerificationCreateRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return Response.json(
        { error: "検証するステップを選んでください。" },
        { status: 400 },
      );
    for (const user of DEV_USERS) await ensureUser(env.DB, user);
    const room = await insertRoom(env.DB, DEV_USERS[0].id);
    const stub = namespace.get(namespace.idFromName(room.roomId));
    try {
      await stub.initializeVerification(parsed.data.checkpoint);
      const active = {
        roomId: room.roomId,
        inviteCode: room.inviteCode,
        checkpoint: parsed.data.checkpoint,
      };
      await workspace.setActive(active);
      return Response.json(active);
    } catch {
      await deleteRoom(env.DB, room.roomId);
      await stub.disband();
      return Response.json(
        { error: "検証状態の準備に失敗しました。" },
        { status: 503 },
      );
    }
  }
  const match = path.match(
    /^\/api\/verification\/rooms\/([0-9a-f-]{36})(\/vote)?$/,
  );
  if (!match || !(await findRoomById(env.DB, match[1])))
    return Response.json(
      { error: "検証ルームがありません。" },
      { status: 404 },
    );
  const stub = namespace.get(namespace.idFromName(match[1]));
  if (request.method === "GET" && !match[2]) {
    const status = await stub.verificationStatus(session.sub);
    return Response.json(status ?? { error: "検証ルームがありません。" }, {
      status: status ? 200 : 404,
    });
  }
  if (request.method === "POST" && match[2]) {
    const parsed = VerificationVoteRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return Response.json(
        { error: "操作の形式が不正です。" },
        { status: 400 },
      );
    try {
      const status = await stub.completeVerificationVotes(
        session.sub,
        parsed.data,
      );
      return Response.json(status ?? { error: "検証ルームがありません。" }, {
        status: status ? 200 : 404,
      });
    } catch {
      return Response.json(
        { error: "状態が変わりました。再取得してください。" },
        { status: 409 },
      );
    }
  }
  return Response.json({ error: "not found" }, { status: 404 });
});
export default {
  async fetch(request: Request, env: VerificationWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/api/verification/") &&
      (env.IDEA_BOOST_VERIFY !== "true" ||
        !env.VERIFICATION_CONTROL_TOKEN ||
        env.VERIFICATION_CONTROL_TOKEN.length < 32 ||
        request.headers.get("X-Verification-Control-Token") !==
          env.VERIFICATION_CONTROL_TOKEN ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      return Response.json({ error: "not found" }, { status: 404 });
    return api.fetch(request, env);
  },
};
