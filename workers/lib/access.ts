import { PERMISSIONS, type Permission } from "../../contracts/access";
import { DEV_USERS } from "../../lib/session/dev-users";

export async function hasPermission(
  db: D1Database,
  userId: string,
  permission: Permission,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS allowed FROM user_permissions WHERE user_id = ? AND permission = ?",
    )
    .bind(userId, permission)
    .first<{ allowed: number }>();
  return !!row;
}

export async function seedDevOwnerAccess(db: D1Database): Promise<void> {
  const owner = DEV_USERS[0];
  await db
    .prepare("INSERT OR IGNORE INTO users(id,email,name) VALUES(?,?,?)")
    .bind(owner.id, owner.email, owner.name)
    .run();
  for (const permission of Object.values(PERMISSIONS)) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO user_permissions(user_id,permission) VALUES(?,?)",
      )
      .bind(owner.id, permission)
      .run();
  }
}
