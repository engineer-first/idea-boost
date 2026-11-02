import {
  MEMBER_AVATAR_IDS,
  type MemberAvatarId,
} from "../../contracts/member-avatar";

export function availableMemberAvatars(sql: SqlStorage): MemberAvatarId[] {
  const assigned = new Set(
    sql
      .exec("SELECT avatar_id FROM member_avatar_assignments")
      .toArray()
      .map((row) => String(row.avatar_id)),
  );
  return MEMBER_AVATAR_IDS.filter((id) => !assigned.has(id));
}

export function assignMemberAvatar(
  sql: SqlStorage,
  userId: string,
): MemberAvatarId {
  const existing = sql
    .exec(
      "SELECT avatar_id FROM member_avatar_assignments WHERE user_id=?",
      userId,
    )
    .toArray()[0];
  if (existing) return existing.avatar_id as MemberAvatarId;
  const available = availableMemberAvatars(sql);
  const avatarId = available[Math.floor(Math.random() * available.length)];
  if (!avatarId) throw new Error("顔アイコンの割当上限に達しています。");
  sql.exec(
    "INSERT INTO member_avatar_assignments(user_id,avatar_id) VALUES(?,?)",
    userId,
    avatarId,
  );
  return avatarId;
}
