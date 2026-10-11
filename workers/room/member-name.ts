// 共通の呼び名はAPIで本人確認・保存した後、在籍者の現在名へ反映する。
import type { MessageHandlers } from "./handler-context";
import { findMember } from "./members";
import { getSharingState, saveSharingState } from "./sharing-state";

export const memberNameHandlers: MessageHandlers<"member:rename"> = {
  "member:rename": (ctx, message) => {
    ctx.broadcaster.sendTo(ctx.ws, {
      type: "error",
      code: "invalid-message",
      message: "呼び名の変更方法が変わりました。画面を再読み込みしてください。",
      operationId: message.operationId,
    });
  },
};

export function applyAccountName(
  sql: SqlStorage,
  userId: string,
  name: string,
  revision: number,
): ReturnType<typeof findMember> {
  const previous = findMember(sql, userId);
  if (!previous) return null;
  const applied = sql
    .exec(
      "SELECT revision FROM member_account_name_revisions WHERE user_id=?",
      userId,
    )
    .toArray()[0];
  if (applied && Number(applied.revision) >= revision) return null;
  const member = { ...previous, name };
  sql.exec(
    "INSERT INTO member_account_name_revisions(user_id,revision) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision",
    userId,
    revision,
  );
  sql.exec(
    "INSERT INTO member_display_names(user_id,name) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name",
    userId,
    name,
  );
  sql.exec("UPDATE members SET name=? WHERE user_id=?", name, userId);
  const sharing = getSharingState(sql);
  if (sharing)
    saveSharingState(sql, {
      ...sharing,
      order: sharing.order.map((entry) =>
        entry.userId === userId ? member : entry,
      ),
    });
  return previous.name === name ? null : member;
}
