// api-worker: D1（ロビー）と RoomDO（ルームの中身）への唯一の入口。
// すべてのエンドポイントはセッション（または署名済みログイン主張）を要求する。
// Next 側は UI とセッション Cookie の発行だけを担い、データへは必ずここを通る。
import { z } from "zod";
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
import {
  deleteRoom,
  ensureUser,
  findRoomByCode,
  findRoomById,
  findUserNameById,
  insertRoom,
  upsertUserFromAssertion,
} from "./lib/db";
import { getSessionFromRequest } from "./lib/session";
import { requireSessionSecret } from "./lib/session-secret";
import { HOST_ID_HEADER, RoomDO, USER_ID_HEADER } from "./room/room-do";

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
    headers: { "Content-Type": "application/json" },
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
  return json({ userId });
}

// POST /api/rooms — ルーム作成。D1 に行を作り、RoomDO に host を登録する。
async function handleCreateRoom(
  env: ApiWorkerEnv,
  session: SessionPayload,
): Promise<Response> {
  await ensureUser(env.DB, {
    id: session.sub,
    email: session.email,
    name: session.name,
  });
  const room = await insertRoom(env.DB, session.sub);
  // 作成者をホスト登録し、フェーズを lobby（開始前）に初期化する。
  await roomStub(env, room.roomId).initializeNewRoom(session.sub, session.name);
  return json({ roomId: room.roomId, inviteCode: room.inviteCode });
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
    return error(409, "このルームは20人までです。");
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
  return json({
    roomId: room.roomId,
    inviteCode: room.inviteCode,
    isHost: room.hostId === session.sub,
    hostUserId: room.hostId,
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

  // ホストの「退出」はルーム解散。残メンバーを開始不能にしない。
  // D1 のディレクトリ抹消を先に行い fail-closed にする。
  // disband 成功後に deleteRoom が失敗すると「招待コードで解決できるが
  // 中身は空」のゾンビルームが残り、ホストは既にメンバー外で再試行 404 になる。
  if (room.hostId === session.sub) {
    await deleteRoom(env.DB, roomId);
    await stub.disband();
    return new Response(null, { status: 204 });
  }

  await stub.leave(session.sub);
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

      if (extension) {
        const response = await extension(request, env, session);
        if (response) return response;
      }

      if (method === "POST" && pathname === "/api/rooms") {
        return handleCreateRoom(env, session);
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
        return handleLeaveRoom(env, session, leaveMatch[1]);
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
  } satisfies ExportedHandler<ApiWorkerEnv>;
}

export default createApiWorker();
