import {
  MEMBER_AVATAR_IDS,
  type MemberAvatarId,
} from "../../contracts/member-avatar";

export function nextMemberAvatar(avatarId: MemberAvatarId): MemberAvatarId {
  const index = MEMBER_AVATAR_IDS.indexOf(avatarId);
  return (
    MEMBER_AVATAR_IDS[(index + 1) % MEMBER_AVATAR_IDS.length] ??
    MEMBER_AVATAR_IDS[0]
  );
}

// 新規参加者には参加順で20種類を順繰りに割り当てる。通算21人目以降は
// 先頭へ戻って重複する。退出者の割当を残すため、在籍者だけを見て空きを
// 探すことはしない。
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
  const assignedCount = Number(
    sql.exec("SELECT COUNT(*) AS count FROM member_avatar_assignments").one()
      .count,
  );
  const avatarId =
    MEMBER_AVATAR_IDS[assignedCount % MEMBER_AVATAR_IDS.length] ??
    MEMBER_AVATAR_IDS[0];
  sql.exec(
    "INSERT INTO member_avatar_assignments(user_id,avatar_id) VALUES(?,?)",
    userId,
    avatarId,
  );
  return avatarId;
}

// 本人の現在の顔から20種類の固定順で次の顔へ進める。他者の割当は見ない。
export function cycleMemberAvatar(
  sql: SqlStorage,
  userId: string,
): MemberAvatarId {
  const existing = sql
    .exec(
      "SELECT avatar_id FROM member_avatar_assignments WHERE user_id=?",
      userId,
    )
    .toArray()[0];
  const avatarId = existing
    ? nextMemberAvatar(existing.avatar_id as MemberAvatarId)
    : MEMBER_AVATAR_IDS[0];
  sql.exec(
    `INSERT INTO member_avatar_assignments(user_id,avatar_id) VALUES(?,?)
     ON CONFLICT (user_id) DO UPDATE SET avatar_id=excluded.avatar_id`,
    userId,
    avatarId,
  );
  return avatarId;
}
