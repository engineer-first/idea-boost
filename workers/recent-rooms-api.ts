import {
  RECENT_ROOMS_LIMIT,
  type RecentRoom,
  type RecentRoomsResponse,
} from "../contracts/recent-rooms";
import type { ApiWorkerEnv } from "./api-worker";
import { completedJson, listCompletedRooms } from "./completed-rooms-api";
import { accountStub } from "./room-participation-api";

// 本人が在籍中の未完了ルーム（AccountDO の候補をRoomDOで再照合）を先に、
// 成果を閲覧できる完了ルームを新しい順に続ける。どちらも本人の session.sub だけで引く。
export async function handleRecentRooms(
  request: Request,
  env: ApiWorkerEnv,
  userId: string,
): Promise<Response> {
  if (request.method !== "GET")
    return completedJson({ error: "利用できない操作です。" }, 405);
  const [active, completed] = await Promise.all([
    accountStub(env, userId).currentRooms(userId),
    listCompletedRooms(env, userId, null, RECENT_ROOMS_LIMIT),
  ]);
  if (!active)
    return completedJson(
      { error: "参加状況を確認できません。もう一度お試しください。" },
      503,
    );
  const rooms: RecentRoom[] = [
    ...active.map(
      (room): RecentRoom => ({
        roomId: room.roomId,
        label: room.name,
        status: "active",
      }),
    ),
    ...completed.rooms.map(
      (room): RecentRoom => ({
        roomId: room.roomId,
        label: room.idea,
        status: "completed",
        completedAt: room.completedAt,
        expiresAt: room.expiresAt,
      }),
    ),
  ].slice(0, RECENT_ROOMS_LIMIT);
  const dates = await roomDates(
    env,
    rooms.map((room) => room.roomId),
  );
  return completedJson({
    rooms: rooms.map((room) => {
      const found = dates.get(room.roomId);
      const createdAt = found?.createdAt;
      // 完了ルームは成果の閲覧期限が正本。進行中は成果の保全期限（使うたびに延びる）を出す。
      const expiresAt = room.expiresAt ?? found?.expiresAt;
      return {
        ...room,
        ...(createdAt === undefined ? {} : { createdAt }),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      };
    }),
  } satisfies RecentRoomsResponse);
}

// 返すルームは上で本人の在籍・閲覧権で絞り込み済み。ここでは表示用の日付だけを足す。
// 記録が無い・読めないときは日付を省き、一覧そのものは返す。
async function roomDates(
  env: ApiWorkerEnv,
  roomIds: string[],
): Promise<Map<string, { createdAt?: number; expiresAt?: number }>> {
  const dates = new Map<string, { createdAt?: number; expiresAt?: number }>();
  if (!roomIds.length) return dates;
  try {
    const { results } = await env.DB.prepare(
      `SELECT r.id AS room_id, r.created_at, s.expires_at FROM rooms r LEFT JOIN shared_outcomes s ON s.room_id = r.id WHERE r.id IN (${roomIds.map(() => "?").join(",")})`,
    )
      .bind(...roomIds)
      .all<{
        room_id: string;
        created_at: string | null;
        expires_at: number | null;
      }>();
    for (const row of results) {
      const createdAt = row.created_at
        ? Date.parse(`${row.created_at.replace(" ", "T")}Z`)
        : Number.NaN;
      dates.set(row.room_id, {
        ...(Number.isFinite(createdAt) ? { createdAt } : {}),
        ...(typeof row.expires_at === "number"
          ? { expiresAt: row.expires_at }
          : {}),
      });
    }
  } catch {
    // 日付は補助情報なので、読めなくても一覧を返す。
  }
  return dates;
}
