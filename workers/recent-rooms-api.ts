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
      }),
    ),
  ].slice(0, RECENT_ROOMS_LIMIT);
  return completedJson({ rooms } satisfies RecentRoomsResponse);
}
