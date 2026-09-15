// メンバーシップ（誰がこのルームに入れるか）と表示色の割当、
// ルームオーナー（room_owner = ホスト）の真実。
import {
  NOTE_COLOR_PALETTE,
  type NoteColor,
  type ProtocolMember,
} from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";

type MemberRow = {
  user_id: string;
  name: string;
  color: NoteColor;
};

export function findMember(
  sql: SqlStorage,
  userId: string,
): ProtocolMember | null {
  const row = sql
    .exec("SELECT user_id, name, color FROM members WHERE user_id = ?1", userId)
    .toArray()[0] as unknown as MemberRow | undefined;
  return row ? { userId: row.user_id, name: row.name, color: row.color } : null;
}

export type UpsertMemberResult =
  | { ok: true }
  | { ok: false; reason: "room-full" };

// 参加処理。name は表示用（メンバー一覧で使う）。
// 冪等: 既存メンバーなら name だけを最新に同期して終わる。
// 進行中のルームでも新規メンバーの参加は可能（途中参加OK）。
//
// 新規メンバーの場合のみ、既存メンバー全員の WS に member_joined を
// broadcast する（Realtime 反映）。新規メンバー本人には
// snapshot.members が届くので送らない（本人除外）。
export function upsertMember(
  sql: SqlStorage,
  broadcaster: RoomBroadcaster,
  userId: string,
  name: string | undefined,
): UpsertMemberResult {
  const safeName = name ?? "";
  const existing = sql
    .exec("SELECT name FROM members WHERE user_id = ?1", userId)
    .toArray()[0] as { name: string } | undefined;
  const assigned = sql
    .exec(
      "SELECT color FROM member_color_assignments WHERE user_id = ?1",
      userId,
    )
    .toArray()[0] as { color: NoteColor } | undefined;

  let color = assigned?.color;
  if (!color) {
    const assignments = sql
      .exec("SELECT color FROM member_color_assignments")
      .toArray()
      .map((row) => String(row.color));
    if (assignments.length >= NOTE_COLOR_PALETTE.length) {
      return { ok: false, reason: "room-full" };
    }

    const availableColors = NOTE_COLOR_PALETTE.filter(
      (candidate) => !assignments.includes(candidate),
    );
    color =
      availableColors[Math.floor(Math.random() * availableColors.length)] ??
      "yellow";
    sql.exec(
      `INSERT INTO member_color_assignments (user_id, color)
       VALUES (?1, ?2)`,
      userId,
      color,
    );
  }

  sql.exec(
    `INSERT INTO members (user_id, name, color) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id) DO UPDATE SET name = ?2, color = ?3`,
    userId,
    safeName,
    color,
  );

  if (!existing || existing.name !== safeName) {
    broadcaster.broadcastToAllExcept(
      {
        type: "member_joined",
        member: { userId, name: safeName, color },
      },
      userId,
    );
  }
  return { ok: true };
}

export function isMember(sql: SqlStorage, userId: string): boolean {
  const cursor = sql.exec("SELECT 1 FROM members WHERE user_id = ?1", userId);
  return cursor.toArray().length > 0;
}

export function removeMember(sql: SqlStorage, userId: string): void {
  sql.exec("DELETE FROM members WHERE user_id = ?1", userId);
}

// メンバー一覧を参加順（joined_at 昇順）で返す。snapshot 構築に使う。
export function listMembers(sql: SqlStorage): ProtocolMember[] {
  const rows = sql
    .exec(
      "SELECT user_id, name, color FROM members ORDER BY joined_at, user_id",
    )
    .toArray();
  return rows.map((row) => {
    const member = row as unknown as MemberRow;
    return { userId: member.user_id, name: member.name, color: member.color };
  });
}

// note:create で作者の割当色を引くために使う。
export function getMemberColor(
  sql: SqlStorage,
  userId: string,
): NoteColor | undefined {
  const row = sql
    .exec("SELECT color FROM members WHERE user_id = ?1", userId)
    .toArray()[0] as { color: NoteColor } | undefined;
  return row?.color;
}

// room_owner が未設定のときだけ userId をホストとして記録する。
// 以後にホストを書き換える経路は持たない。
export function ensureHost(sql: SqlStorage, userId: string): void {
  const existing = sql
    .exec("SELECT host_id FROM room_owner WHERE id = 1")
    .toArray()[0] as { host_id: string | null } | undefined;
  if (!existing?.host_id) {
    sql.exec("UPDATE room_owner SET host_id = ?1 WHERE id = 1", userId);
  }
}

export function isHostUser(sql: SqlStorage, userId: string): boolean {
  const row = sql
    .exec("SELECT host_id FROM room_owner WHERE id = 1")
    .toArray()[0] as { host_id: string | null } | undefined;
  return row?.host_id === userId;
}
