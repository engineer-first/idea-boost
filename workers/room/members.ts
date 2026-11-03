// メンバーシップ（誰がこのルームに入れるか）と表示色と顔の割当。

import type { MemberAvatarId } from "../../contracts/member-avatar";

import {
  MEMBER_COLOR_ASSIGNMENT_ORDER,
  type NoteColor,
  type ProtocolMember,
} from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";
import { assignMemberAvatar, availableMemberAvatars } from "./member-avatars";

type MemberRow = {
  user_id: string;
  name: string;
  color: NoteColor;
  avatar_id?: MemberAvatarId;
};

export function findMember(
  sql: SqlStorage,
  userId: string,
): ProtocolMember | null {
  const row = sql
    .exec(
      "SELECT m.user_id, m.name, m.color, a.avatar_id FROM members m LEFT JOIN member_avatar_assignments a ON a.user_id=m.user_id WHERE m.user_id = ?1",
      userId,
    )
    .toArray()[0] as unknown as MemberRow | undefined;
  return row
    ? {
        userId: row.user_id,
        name: row.name,
        color: row.color,
        ...(row.avatar_id ? { avatarId: row.avatar_id } : {}),
      }
    : null;
}

export type UpsertMemberResult =
  | { ok: true }
  | { ok: false; reason: "room-full" | "room-closed" };

// 参加処理。name は表示用（メンバー一覧で使う）。
// 冪等: 本人が設定した表示名は認証由来名で上書きしない。
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
  const override = sql
    .exec("SELECT name FROM member_display_names WHERE user_id=?1", userId)
    .toArray()[0] as { name: string } | undefined;
  const safeName = override?.name ?? name ?? "";
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
    if (assignments.length >= MEMBER_COLOR_ASSIGNMENT_ORDER.length) {
      return { ok: false, reason: "room-full" };
    }

    const availableColor = MEMBER_COLOR_ASSIGNMENT_ORDER.find(
      (candidate) => !assignments.includes(candidate),
    );
    if (!availableColor) {
      return { ok: false, reason: "room-full" };
    }
    color = availableColor;
    sql.exec(
      `INSERT INTO member_color_assignments (user_id, color)
       VALUES (?1, ?2)`,
      userId,
      color,
    );
  }

  const avatarId = assignMemberAvatar(sql, userId);
  sql.exec(
    `INSERT INTO members (user_id, name, color) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id) DO UPDATE SET name = ?2, color = ?3`,
    userId,
    safeName,
    color,
  );

  // 再参加後は在籍者として扱い、次の退出選択を新たに適用する。
  sql.exec("DELETE FROM retained_outcome_participants WHERE user_id=?", userId);

  if (!existing || existing.name !== safeName) {
    broadcaster.broadcastToAllExcept(
      {
        type: "member_joined",
        member: { userId, name: safeName, color, avatarId },
        availableAvatarCount: availableMemberAvatars(sql).length,
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
      "SELECT m.user_id, m.name, m.color, a.avatar_id FROM members m LEFT JOIN member_avatar_assignments a ON a.user_id=m.user_id ORDER BY m.joined_at, m.user_id",
    )
    .toArray();
  return rows.map((row) => {
    const member = row as unknown as MemberRow;
    return {
      userId: member.user_id,
      name: member.name,
      color: member.color,
      ...(member.avatar_id ? { avatarId: member.avatar_id } : {}),
    };
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
