// api-worker: D1（ロビー）と RoomDO（ルームの中身）への唯一の入口。
// すべてのエンドポイントはセッション（または署名済みログイン主張）を要求する。
// Next 側は UI とセッション Cookie の発行だけを担い、データへは必ずここを通る。
import { z } from "zod";
import {
  AccessEmailSchema,
  ManagedReadPermissionSchema,
  PERMISSIONS,
} from "../contracts/access";
import { CreateRoomInputSchema } from "../contracts/api";
import { LeaveRoomRequestSchema } from "../contracts/completed-rooms";
import { isUuid } from "../contracts/ids";
import {
  isValidInviteCode,
  normalizeInviteCode,
} from "../contracts/invite-code";
import {
  LoginAssertionSchema,
  type SessionPayload,
  TOKEN_AUDIENCE,
} from "../contracts/session";
import { verifyToken } from "../lib/session/token";
import { handleCompletedRooms } from "./completed-rooms-api";
import {
  acceptFeedback,
  deleteExpiredFeedback,
  listFeedback,
} from "./feedback";
import { hasPermission, seedDevOwnerAccess } from "./lib/access";
import {
  deleteRoom,
  ensureUser,
  findRoomByCode,
  findRoomById,
  findUserNameById,
  upsertUserFromAssertion,
} from "./lib/db";
import {
  CreationConflict,
  CreationGone,
  completeRoomCreation,
  reserveRoomCreation,
} from "./lib/room-creation";
import { getSessionFromRequest } from "./lib/session";
import { requireSessionSecret } from "./lib/session-secret";
import { HOST_ID_HEADER, RoomDO, USER_ID_HEADER } from "./room/room-do";
import { handleSharedOutcomes } from "./shared-outcomes-api";

export { RoomDO };

// wrangler types の生成物は api-worker.ts を root 型検査から参照する一方、
// secret binding は生成されないため、公開境界で SESSION_SECRET を明示する。
export type ApiWorkerEnv = Env & {
  SESSION_SECRET: string;
};

const SyncRequestSchema = z.object({ assertion: z.string().min(1) });
const JoinRequestSchema = z.object({ code: z.string() });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

function roomStub(
  env: ApiWorkerEnv,
  roomId: string,
): DurableObjectStub<RoomDO> {
  return env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// POST /api/auth/sync — ログイン確定時のユーザー upsert。
// セッションではなく「署名済みログイン主張」で認証する（ログイン前なので）。
async function handleAuthSync(
  request: Request,
  env: ApiWorkerEnv,
): Promise<Response> {
  const body = SyncRequestSchema.safeParse(await readJsonBody(request));
  if (!body.success) {
    return error(400, "リクエスト形式が不正です。");
  }

  const assertion = await verifyToken(
    body.data.assertion,
    LoginAssertionSchema,
    { secret: env.SESSION_SECRET, audience: TOKEN_AUDIENCE.loginAssertion },
  );
  if (!assertion) {
    return error(401, "ログイン主張を検証できませんでした。");
  }

  const userId = await upsertUserFromAssertion(env.DB, assertion);
  if (assertion.kind === "dev") await seedDevOwnerAccess(env.DB);
  return json({ userId });
}

// POST /api/rooms — ルーム作成。D1 に行を作り、RoomDO に host を登録する。
async function handleCreateRoom(
  request: Request,
  env: ApiWorkerEnv,
  session: SessionPayload,
): Promise<Response> {
  const body = CreateRoomInputSchema.safeParse(
    (await readJsonBody(request)) ?? {},
  );
  if (!body.success)
    return error(400, "ルーム名は80文字以内で入力してください。");
  await ensureUser(env.DB, {
    id: session.sub,
    email: session.email,
    name: session.name,
  });
  try {
    const creation = await reserveRoomCreation(
      env.DB,
      session.sub,
      body.data.requestId,
      body.data.name,
    );
    await completeRoomCreation(env.DB, creation, async () => {
      const result = await roomStub(env, creation.room_id).resumeRoomCreation(
        session.sub,
        session.name,
        { roomId: creation.room_id, name: creation.name },
      );
      if (result === "closed") throw new CreationGone();
    });
    return json({ roomId: creation.room_id, inviteCode: creation.invite_code });
  } catch (cause) {
    if (cause instanceof CreationConflict)
      return error(409, "同じ作成要求の入力を変更できません。");
    if (cause instanceof CreationGone)
      return error(410, "この作成要求のルームは終了または削除されています。");
    return error(
      503,
      "作成結果を確認できません。同じ要求で再試行してください。",
    );
  }
}

// POST /api/rooms/join — 招待コードで参加（冪等）。
async function handleJoinRoom(
  request: Request,
  env: ApiWorkerEnv,
  session: SessionPayload,
): Promise<Response> {
  const body = JoinRequestSchema.safeParse(await readJsonBody(request));
  if (!body.success) {
    return error(400, "リクエスト形式が不正です。");
  }

  const code = normalizeInviteCode(body.data.code);
  if (!isValidInviteCode(code)) {
    return error(400, "招待コードは英数字6桁で入力してください。");
  }

  const room = await findRoomByCode(env.DB, code);
  if (!room) {
    return error(404, "ルームが見つかりませんでした。");
  }

  const stub = roomStub(env, room.roomId);
  const joined = await stub.upsertMember(session.sub, session.name);
  if (!joined.ok) {
    return error(
      409,
      joined.reason === "room-closed"
        ? "終了したルームには参加できません。"
        : "このルームは20人までです。",
    );
  }
  return json({ roomId: room.roomId });
}

// GET /api/rooms/:id — メンバーだけがルーム情報を取得できる。
// 非メンバーには存在しないルームと同じ 404 を返し、存在を推測させない。
// isHost / hostUserId / phase はこのエンドポイントでのみ返す。
// メンバー限定（非メンバーは 404）。hostUserId はメンバー一覧でホスト表示に使う。
async function handleGetRoom(
  env: ApiWorkerEnv,
  session: SessionPayload,
  roomId: string,
): Promise<Response> {
  const room = await findRoomById(env.DB, roomId);
  if (!room) {
    return error(404, "ルームが見つかりませんでした。");
  }

  const stub = roomStub(env, roomId);
  const member = await stub.isMember(session.sub);
  if (!member) {
    return error(404, "ルームが見つかりませんでした。");
  }

  const phase = await stub.getPhase();
  const host = await stub.getCurrentHost(room.hostId);
  if (!host.hostUserId) return error(409, "ホスト情報を取得できませんでした。");
  return json({
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    isHost: host.hostUserId === session.sub,
    hostUserId: host.hostUserId,
    phase,
  });
}

// GET /api/rooms/:id/members — メンバーだけが参加メンバー一覧を取得できる。
// 初期表示（SSR）のために name 付きで返す。Realtime 反映は WS の
// member_joined / snapshot.members で行う。
async function handleListMembers(
  env: ApiWorkerEnv,
  session: SessionPayload,
  roomId: string,
): Promise<Response> {
  const room = await findRoomById(env.DB, roomId);
  if (!room) {
    return error(404, "ルームが見つかりませんでした。");
  }

  const stub = roomStub(env, roomId);
  const member = await stub.isMember(session.sub);
  if (!member) {
    return error(404, "ルームが見つかりませんでした。");
  }

  const members = await stub.listMembers();
  return json({ members });
}

// POST /api/rooms/:id/leave — 退出 / 解散。
// - 非ホスト: 自分の WS close + members から外れ、他メンバーに member_left。
// - ホスト: ルームを解散する（全 WS close + RoomDO クリア + D1 rooms 削除）。
// 認可:
//   - 未ログインは 401
//   - ルームが存在しない、または自分がメンバーでない場合は 404
//     （存在秘匿。クライアントは 204/404 を成功相当としてよい）
async function handleLeaveRoom(
  request: Request,
  env: ApiWorkerEnv,
  session: SessionPayload,
  roomId: string,
): Promise<Response> {
  const room = await findRoomById(env.DB, roomId);
  if (!room) {
    return error(404, "ルームが見つかりませんでした。");
  }

  const stub = roomStub(env, roomId);
  const body = LeaveRoomRequestSchema.safeParse(
    (await readJsonBody(request)) ?? {},
  );
  if (!body.success) return error(400, "リクエスト形式が不正です。");
  // 作成者IDはlegacy seedのみ。判定と更新を別RPCに分けず、DOで直列化する。
  if (
    (body.data.intent !== "self" || body.data.outcomeAccess === "retain") &&
    (await stub.isMember(session.sub))
  )
    await stub.ensureSharedOutcome(roomId, room.createdAt);
  const result = await stub.leaveOrDisband(
    session.sub,
    room.hostId,
    body.data.intent,
    body.data.expectedHostRevision,
    body.data.outcomeAccess,
  );
  if (result === "not-member")
    return error(404, "ルームが見つかりませんでした。");
  if (result === "forbidden")
    return error(
      409,
      "ホストまたはルームの状態が変わりました。画面を更新して操作し直してください。",
    );
  if (result === "disbanded") await deleteRoom(env.DB, roomId);
  return new Response(null, { status: 204 });
}

// GET /api/rooms/lookup?code=XXX — 招待コードからルーム解決して hostname を返す。
// 招待URL ページ (/invite/[code]) で、入室確認 Dialog の文言に
// 「hostname さんが作成したルームに参加しますか？」を出すために使う。
// 未ログインは 401（招待URL ページ側でリダイレクト済みなので到達しない）。
async function handleLookupRoom(
  request: Request,
  env: ApiWorkerEnv,
  _session: SessionPayload,
): Promise<Response> {
  const url = new URL(request.url);
  const code = normalizeInviteCode(url.searchParams.get("code") ?? "");
  if (!isValidInviteCode(code)) {
    return error(400, "招待コードは英数字6桁で入力してください。");
  }
  const room = await findRoomByCode(env.DB, code);
  if (!room) {
    return error(404, "ルームが見つかりませんでした。");
  }
  if (!(await roomStub(env, room.roomId).isJoinable()))
    return error(404, "ルームが見つかりませんでした。");
  const hostName = await findUserNameById(env.DB, room.hostId);
  return json({
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    hostName: hostName ?? "ホスト",
  });
}

// GET /api/rooms/:id/ws — メンバーのみ WebSocket 接続できる。
// 認可はここで完結させ、DO へは検証済みユーザーIDと D1 rooms.host_id を
// ヘッダーで引き継ぐ。入力された同名ヘッダーは必ず上書きし、hostId は
// RoomDO の room_owner が未設定の旧ルームをバックフィルするシードにだけ使う。
async function handleRoomWebSocket(
  request: Request,
  env: ApiWorkerEnv,
  session: SessionPayload,
  roomId: string,
): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return error(426, "WebSocket でアクセスしてください。");
  }

  const room = await findRoomById(env.DB, roomId);
  if (!room) {
    return error(404, "ルームが見つかりませんでした。");
  }

  const stub = roomStub(env, roomId);
  const member = await stub.isMember(session.sub);
  if (!member) {
    return error(404, "ルームが見つかりませんでした。");
  }

  await stub.ensureSharedOutcome(roomId, room.createdAt);
  const headers = new Headers(request.headers);
  headers.set(USER_ID_HEADER, session.sub);
  headers.set(HOST_ID_HEADER, room.hostId);
  return stub.fetch(request.url, { headers });
}

export type AuthenticatedRoute = (
  request: Request,
  env: ApiWorkerEnv,
  session: SessionPayload,
) => Promise<Response | null>;

export type ApiWorkerHandler = {
  scheduled(controller: ScheduledController, env: ApiWorkerEnv): Promise<void>;
  fetch(request: Request, env: ApiWorkerEnv): Promise<Response>;
};

export function createApiWorker(
  extension?: AuthenticatedRoute,
): ApiWorkerHandler {
  return {
    async fetch(request: Request, env: ApiWorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      const { pathname } = url;
      const method = request.method;

      // 疎通確認専用。認可・SESSION_SECRET の設定状態に関わらず、
      // この Worker が起動してリクエストを処理できているかだけを見る
      // （スモークテストが Next.js -> サービスバインディング -> ここまでの
      // 経路が繋がっているかを確認するために叩く）。
      if (method === "GET" && pathname === "/api/health") {
        return json({ ok: true });
      }

      // 設定漏れ（本番で secret 未設定）を既知鍵での fail-open にせず、
      // 明示的に落とす。認証を扱う前に必ず検証する。
      try {
        requireSessionSecret(env.SESSION_SECRET);
      } catch {
        return error(503, "サーバーの認証設定が未完了です。");
      }

      if (method === "POST" && pathname === "/api/auth/sync") {
        return handleAuthSync(request, env);
      }

      // 以降はすべてセッション必須。
      const session = await getSessionFromRequest(request, env.SESSION_SECRET);
      if (!session) {
        return error(401, "ログインが必要です。");
      }

      const feedbackMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/feedback$/);
      if (pathname === "/api/feedback" || feedbackMatch) {
        try {
          return pathname === "/api/feedback"
            ? await listFeedback(request, env, session)
            : await acceptFeedback(
                request,
                env,
                session,
                feedbackMatch?.[1] ?? "",
              );
        } catch {
          return error(
            503,
            "意見を処理できませんでした。接続を確認して再試行してください。",
          );
        }
      }

      if (
        pathname === "/api/completed-rooms" ||
        pathname.startsWith("/api/completed-rooms/")
      )
        return handleCompletedRooms(request, env, session.sub);

      if (
        pathname === "/api/shared-outcomes" ||
        pathname.startsWith("/api/shared-outcomes/")
      ) {
        if (
          !(await hasPermission(
            env.DB,
            session.sub,
            PERMISSIONS.readSharedOutcomes,
          ))
        )
          return error(403, "成果の閲覧権限がありません。");
        return handleSharedOutcomes(request, env);
      }

      if (pathname === "/api/admin/access") {
        if (
          !(await hasPermission(
            env.DB,
            session.sub,
            PERMISSIONS.manageSharedOutcomesAccess,
          ))
        )
          return error(403, "閲覧者の管理権限がありません。");
        const permission = ManagedReadPermissionSchema.safeParse(
          url.searchParams.get("permission") ?? PERMISSIONS.readSharedOutcomes,
        );
        if (!permission.success)
          return error(400, "管理できる閲覧権限を指定してください。");
        if (method === "GET") {
          const rows = await env.DB.prepare(
            "SELECT users.id, users.name, users.email FROM user_permissions JOIN users ON users.id = user_permissions.user_id WHERE user_permissions.permission = ? ORDER BY users.email",
          )
            .bind(permission.data)
            .all<{ id: string; name: string | null; email: string }>();
          return json({ users: rows.results });
        }
        if (method === "POST" || method === "DELETE") {
          const parsed = AccessEmailSchema.safeParse(
            await readJsonBody(request),
          );
          if (!parsed.success)
            return error(400, "メールアドレスを確認してください。");
          const user = await env.DB.prepare(
            "SELECT id FROM users WHERE lower(email) = lower(?)",
          )
            .bind(parsed.data.email)
            .first<{ id: string }>();
          if (!user)
            return error(
              404,
              "このユーザーはまだ Idea Boost に登録されていません。先に Google ログインしてください。",
            );
          if (method === "POST")
            await env.DB.prepare(
              "INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,?)",
            )
              .bind(user.id, permission.data)
              .run();
          else
            await env.DB.prepare(
              "DELETE FROM user_permissions WHERE user_id = ? AND permission = ?",
            )
              .bind(user.id, permission.data)
              .run();
          return json({ ok: true });
        }
        return error(405, "利用できない操作です。");
      }

      if (extension) {
        const response = await extension(request, env, session);
        if (response) return response;
      }

      if (method === "POST" && pathname === "/api/rooms") {
        return handleCreateRoom(request, env, session);
      }

      // /api/rooms/lookup — 招待コードからルーム解決（hostname を返す）
      const lookupMatch = pathname.match(/^\/api\/rooms\/lookup$/);
      if (method === "GET" && lookupMatch) {
        return handleLookupRoom(request, env, session);
      }

      if (method === "POST" && pathname === "/api/rooms/join") {
        return handleJoinRoom(request, env, session);
      }

      const wsMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
      if (method === "GET" && wsMatch?.[1]) {
        if (!isUuid(wsMatch[1])) {
          return error(404, "ルームが見つかりませんでした。");
        }
        return handleRoomWebSocket(request, env, session, wsMatch[1]);
      }

      // /members は /ws より先に評価する必要はない（path が違う）が、
      // /rooms/:id 直下の GET と区別するためパスを明示する。
      const membersMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/members$/);
      if (method === "GET" && membersMatch?.[1]) {
        if (!isUuid(membersMatch[1])) {
          return error(404, "ルームが見つかりませんでした。");
        }
        return handleListMembers(env, session, membersMatch[1]);
      }

      // /leave は /ws /members と同じく「/rooms/:id/...」のサフィックス。
      const leaveMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/leave$/);
      if (method === "POST" && leaveMatch?.[1]) {
        if (!isUuid(leaveMatch[1])) {
          return error(404, "ルームが見つかりませんでした。");
        }
        return handleLeaveRoom(request, env, session, leaveMatch[1]);
      }

      const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)$/);
      if (method === "GET" && roomMatch?.[1]) {
        if (!isUuid(roomMatch[1])) {
          return error(404, "ルームが見つかりませんでした。");
        }
        return handleGetRoom(env, session, roomMatch[1]);
      }

      return error(404, "not found");
    },
    async scheduled(
      _controller: ScheduledController,
      env: ApiWorkerEnv,
    ): Promise<void> {
      await deleteExpiredFeedback(env.DB);
    },
  } satisfies ExportedHandler<ApiWorkerEnv>;
}

export default createApiWorker();
