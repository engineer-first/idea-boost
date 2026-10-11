// この索引は配信先候補だけを持つ。在籍・完了・期限の最終判断はRoomDOに委ねる。
import type { ApiWorkerEnv } from "../api-worker";

export async function indexRoomDisplayNames(
  env: ApiWorkerEnv,
  roomId: string,
): Promise<void> {
  const room = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  const members = await room.listMembers();
  if (members.length)
    await env.DB.batch(
      members.map((member) =>
        env.DB.prepare(
          "INSERT OR IGNORE INTO user_display_name_rooms(user_id,room_id) SELECT id,? FROM users WHERE id=?",
        ).bind(roomId, member.userId),
      ),
    );
  // 索引登録後にプロフィールを読むことで、並行する共通名更新へ追いつく。
  const profiles = await env.DB.prepare(
    "SELECT users.id,display_name AS name,display_name_revision AS revision FROM users JOIN user_display_name_rooms ON users.id=user_id WHERE room_id=? AND display_name IS NOT NULL",
  )
    .bind(roomId)
    .all<{ id: string; name: string; revision: number }>();
  for (const profile of profiles.results)
    await room.syncAccountDisplayName(
      profile.id,
      profile.name,
      profile.revision,
    );
  // 同期失敗は未完了のままにして、次の定期処理で再試行する。
  await env.DB.prepare(
    "INSERT OR IGNORE INTO display_name_indexed_rooms(room_id) VALUES(?)",
  )
    .bind(roomId)
    .run();
}

export async function backfillDisplayNameDirectory(
  env: ApiWorkerEnv,
): Promise<void> {
  const rooms = await env.DB.prepare(
    "SELECT id FROM rooms LEFT JOIN display_name_indexed_rooms ON room_id=id WHERE room_id IS NULL AND creation_visibility IN ('published','legacy') ORDER BY id LIMIT 32",
  ).all<{ id: string }>();
  const failures: unknown[] = [];
  for (const room of rooms.results) {
    try {
      await indexRoomDisplayNames(env, room.id);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "呼び名索引の同期に失敗しました。");
}
