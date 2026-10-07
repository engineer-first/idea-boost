import {
  CompletedRoomsCursorSchema,
  type CompletedRoomsResponse,
  CompletedSceneKindSchema,
} from "../contracts/completed-rooms";
import { isUuid } from "../contracts/ids";
import type { ApiWorkerEnv } from "./api-worker";
import { isCreationPublished } from "./lib/room-creation";
export function completedJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
function notFound(): Response {
  return completedJson({ error: "ルームが見つかりませんでした。" }, 404);
}
export async function handleCompletedRooms(
  request: Request,
  env: ApiWorkerEnv,
  userId: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET")
    return completedJson({ error: "利用できない操作です。" }, 405);
  if (url.pathname === "/api/completed-rooms") {
    let cursor: { completedAt: number; roomId: string } | null = null;
    const value = url.searchParams.get("cursor");
    if (value) {
      try {
        cursor = CompletedRoomsCursorSchema.parse(JSON.parse(atob(value)));
      } catch {
        return completedJson({ error: "取得位置が不正です。" }, 400);
      }
    }
    const rows = await env.DB.prepare(
      `SELECT room_id,completed_at FROM completed_room_viewers WHERE user_id=? AND expires_at>? AND (EXISTS(SELECT 1 FROM shared_outcomes s WHERE s.room_id=completed_room_viewers.room_id AND s.creation_visibility IN ('published','legacy')) OR EXISTS(SELECT 1 FROM rooms r WHERE r.id=completed_room_viewers.room_id AND r.creation_visibility='legacy')) ${cursor ? "AND (completed_at<? OR (completed_at=? AND room_id<?))" : ""} ORDER BY completed_at DESC,room_id DESC LIMIT 21`,
    )
      .bind(
        userId,
        Date.now(),
        ...(cursor
          ? [cursor.completedAt, cursor.completedAt, cursor.roomId]
          : []),
      )
      .all<{ room_id: string; completed_at: number }>();
    const page = rows.results.slice(0, 20);
    const results = await Promise.all(
      page.map((row) =>
        env.ROOM_DO.get(env.ROOM_DO.idFromName(row.room_id)).getCompletedRoom(
          userId,
        ),
      ),
    );
    const rooms: CompletedRoomsResponse["rooms"] = [];
    for (const completed of results) {
      if (completed)
        rooms.push({
          roomId: completed.roomId,
          idea: completed.idea,
          completedAt: completed.completedAt,
          expiresAt: completed.expiresAt,
        });
    }
    const last = page.at(-1);
    // 認可・期限で除外した索引行も消費する。返却件数ではなく走査位置を継続する。
    return completedJson({
      rooms,
      nextCursor:
        rows.results.length > 20 && last
          ? btoa(
              JSON.stringify({
                completedAt: last.completed_at,
                roomId: last.room_id,
              }),
            )
          : null,
    } satisfies CompletedRoomsResponse);
  }
  const match = url.pathname.match(
    /^\/api\/completed-rooms\/([^/]+)(?:\/scenes\/([^/]+))?$/,
  );
  if (
    !match ||
    !isUuid(match[1]) ||
    !(await isCreationPublished(env.DB, match[1]))
  )
    return notFound();
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(match[1]));
  if (match[2]) {
    const kind = CompletedSceneKindSchema.safeParse(match[2]);
    if (!kind.success) return notFound();
    const board = await stub.getCompletedBoard(userId, kind.data);
    return board ? completedJson(board) : notFound();
  }
  const room = await stub.getCompletedRoom(userId);
  return room ? completedJson(room) : notFound();
}
