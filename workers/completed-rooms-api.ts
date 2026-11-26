import {
  CompletedRoomsCursorSchema,
  type CompletedRoomsResponse,
  CompletedSceneKindSchema,
} from "../contracts/completed-rooms";
import { AppLocaleSchema } from "../contracts/app-locale";
import { isUuid } from "../contracts/ids";
import { ReflectionRequestSchema } from "../contracts/outcome-reflection";
import type { ApiWorkerEnv } from "./api-worker";
import { isCreationPublished } from "./lib/room-creation";
import {
  REFLECTION_BUSY_ERROR,
  REFLECTION_CONFLICT_ERROR,
  REFLECTION_LIMIT_ERROR,
  REFLECTION_RESEARCH_LIMIT_ERROR,
} from "./room/outcome-reflection";
export function completedJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
function notFound(): Response {
  return completedJson({ error: "ルームが見つかりませんでした。" }, 404);
}
/** 本人が閲覧できる完了ルームを新しい順に読む。認可・期限で除外した行も rows に残す。 */
export async function listCompletedRooms(
  env: ApiWorkerEnv,
  userId: string,
  cursor: { completedAt: number; roomId: string } | null,
  limit: number,
): Promise<{
  rows: { room_id: string; completed_at: number }[];
  rooms: CompletedRoomsResponse["rooms"];
}> {
  const rows = await env.DB.prepare(
    `SELECT room_id,completed_at FROM completed_room_viewers WHERE user_id=? AND expires_at>? AND (EXISTS(SELECT 1 FROM shared_outcomes s WHERE s.room_id=completed_room_viewers.room_id AND s.creation_visibility IN ('published','legacy')) OR EXISTS(SELECT 1 FROM rooms r WHERE r.id=completed_room_viewers.room_id AND r.creation_visibility='legacy')) ${cursor ? "AND (completed_at<? OR (completed_at=? AND room_id<?))" : ""} ORDER BY completed_at DESC,room_id DESC LIMIT ?`,
  )
    .bind(
      userId,
      Date.now(),
      ...(cursor
        ? [cursor.completedAt, cursor.completedAt, cursor.roomId]
        : []),
      limit + 1,
    )
    .all<{ room_id: string; completed_at: number }>();
  const results = await Promise.all(
    rows.results
      .slice(0, limit)
      .map((row) =>
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
  return { rows: rows.results, rooms };
}
export async function handleCompletedRooms(
  request: Request,
  env: ApiWorkerEnv,
  userId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const reflection = url.pathname.match(
    /^\/api\/completed-rooms\/([^/]+)\/reflection$/,
  );
  if (reflection) {
    const localeResult = AppLocaleSchema.safeParse(url.searchParams.get("locale") ?? "ja");
    const locale = localeResult.success ? localeResult.data : "ja";
    if (!["GET", "POST"].includes(request.method))
      return completedJson({ error: "利用できない操作です。" }, 405);
    if (
      !isUuid(reflection[1]) ||
      !(await isCreationPublished(env.DB, reflection[1]))
    )
      return notFound();
    let input: unknown;
    try {
      if (request.method === "POST") {
        const text = await request.text();
        if (text.length > 2048)
          return completedJson({ error: "入力が長すぎます。" }, 400);
        input = JSON.parse(text);
      }
    } catch {
      return completedJson({ error: "入力が不正です。" }, 400);
    }
    const parsed =
      request.method === "POST"
        ? ReflectionRequestSchema.safeParse(input)
        : null;
    if (parsed && !parsed.success)
      return completedJson({ error: "入力が不正です。" }, 400);
    try {
      const result = await env.ROOM_DO.get(
        env.ROOM_DO.idFromName(reflection[1]),
      ).getOutcomeReflection(userId, parsed?.success ? parsed.data : null, locale);
      return result ? completedJson(result) : notFound();
    } catch (cause) {
      if (
        cause instanceof Error &&
        [
          REFLECTION_BUSY_ERROR,
          REFLECTION_LIMIT_ERROR,
          REFLECTION_RESEARCH_LIMIT_ERROR,
          REFLECTION_CONFLICT_ERROR,
        ].includes(cause.message)
      ) {
        const englishErrors: Record<string, string> = {
          [REFLECTION_BUSY_ERROR]: "Another AI generation is running in this room. Try again when it finishes.",
          [REFLECTION_LIMIT_ERROR]: "This room has reached the limit for generating production prompts. Previously generated content is still available.",
          [REFLECTION_RESEARCH_LIMIT_ERROR]: "This room has reached the limit for generating research plans. The saved plan is still available.",
          [REFLECTION_CONFLICT_ERROR]: "The shared research plan has changed. Refresh it before trying again.",
        };
        return completedJson(
          { error: locale === "en" ? englishErrors[cause.message] : cause.message },
          [REFLECTION_LIMIT_ERROR, REFLECTION_RESEARCH_LIMIT_ERROR].includes(
            cause.message,
          )
            ? 429
            : 409,
        );
      }
      return completedJson(
        {
          error: locale === "en"
            ? "AI generation failed. Please wait a moment and try again."
            : "AIの生成に失敗しました。時間をおいて再試行してください。",
        },
        503,
      );
    }
  }
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
    const { rows, rooms } = await listCompletedRooms(env, userId, cursor, 20);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    // 認可・期限で除外した索引行も消費する。返却件数ではなく走査位置を継続する。
    return completedJson({
      rooms,
      nextCursor:
        rows.length > 20 && last
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
