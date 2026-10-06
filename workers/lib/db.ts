// D1（ロビー層）へのクエリ。ルームの中身（メンバー・付箋）の真実は RoomDO が
// 持つため、ここにあるのは「ユーザー」と「招待コード → ルーム解決」だけ。

import { generateInviteCode } from "../../contracts/invite-code";
import type { LoginAssertion } from "../../contracts/session";
import { SHARED_OUTCOME_RETENTION_MS } from "../../contracts/shared-outcomes";

export type RoomRecord = {
  roomId: string;
  inviteCode: string;
  hostId: string;
  createdAt?: number;
};

export async function findUserNameById(
  db: D1Database,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT name FROM users WHERE id = ?1")
    .bind(userId)
    .first<{ name: string | null }>();
  return row?.name ?? null;
}

// セッションが指すユーザー行が存在することを保証する。
// 通常はログイン時の /api/auth/sync が行を作るが、ローカルで D1 をリセットした後も
// ブラウザの Cookie は生き残るため、その組み合わせで FK 違反にならないよう防御する。
// 既に同じ id の行があれば何もしない（email の更新は sync の責務）。
export async function ensureUser(
  db: D1Database,
  user: { id: string; email: string; name?: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO users (id, email, name) VALUES (?1, ?2, ?3)",
    )
    .bind(user.id, user.email, user.name ?? null)
    .run();
}

// ログイン主張からユーザーを upsert し、内部ユーザーIDを返す。
// - dev: 主張が持つ固定IDで冪等に upsert する
// - google: googleSub → email の順で既存ユーザーに解決し、なければ新規作成する
export async function upsertUserFromAssertion(
  db: D1Database,
  assertion: LoginAssertion,
): Promise<string> {
  if (assertion.kind === "dev") {
    await db
      .prepare(
        `INSERT INTO users (id, email, name) VALUES (?1, ?2, ?3)
         ON CONFLICT (id) DO UPDATE SET email = ?2, name = ?3`,
      )
      .bind(assertion.userId, assertion.email, assertion.name ?? null)
      .run();
    return assertion.userId;
  }

  // 同一ユーザーの初回ログインが並行すると、両方が SELECT で未登録と判断して
  // から INSERT に至り、片方が UNIQUE 違反（email / google_sub）になる。
  // その時点で相手の INSERT は成功しているので、再解決すれば既存行に合流できる。
  for (let attempt = 0; attempt < 2; attempt++) {
    const bySub = await db
      .prepare("SELECT id FROM users WHERE google_sub = ?1")
      .bind(assertion.googleSub)
      .first<{ id: string }>();
    if (bySub) {
      await db
        .prepare("UPDATE users SET email = ?2, name = ?3 WHERE id = ?1")
        .bind(bySub.id, assertion.email, assertion.name ?? null)
        .run();
      return bySub.id;
    }

    const byEmail = await db
      .prepare("SELECT id FROM users WHERE email = ?1")
      .bind(assertion.email)
      .first<{ id: string }>();
    if (byEmail) {
      await db
        .prepare("UPDATE users SET google_sub = ?2, name = ?3 WHERE id = ?1")
        .bind(byEmail.id, assertion.googleSub, assertion.name ?? null)
        .run();
      return byEmail.id;
    }

    const userId = crypto.randomUUID();
    try {
      await db
        .prepare(
          "INSERT INTO users (id, email, name, google_sub) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(
          userId,
          assertion.email,
          assertion.name ?? null,
          assertion.googleSub,
        )
        .run();
      return userId;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
  throw new Error("ユーザーの作成に失敗しました。もう一度お試しください。");
}

// ルーム行を作成する。招待コードの一意制約に衝突した場合は再生成してリトライする。
export async function insertRoom(
  db: D1Database,
  hostId: string,
  options?: { generateCode?: () => string; maxAttempts?: number },
): Promise<RoomRecord> {
  const generateCode = options?.generateCode ?? generateInviteCode;
  const maxAttempts = options?.maxAttempts ?? 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const roomId = crypto.randomUUID();
    const inviteCode = generateCode();
    try {
      const now = Date.now();
      await db.batch([
        db
          .prepare(
            "INSERT INTO rooms (id, invite_code, host_id,creation_visibility) VALUES (?1, ?2, ?3,'legacy')",
          )
          .bind(roomId, inviteCode, hostId),
        db
          .prepare(
            "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at,creation_visibility) VALUES(?,?,?,'legacy')",
          )
          .bind(roomId, now, now + SHARED_OUTCOME_RETENTION_MS),
      ]);
      return { roomId, inviteCode, hostId };
    } catch (error) {
      if (isUniqueViolation(error)) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("ルームの作成に失敗しました。もう一度お試しください。");
}

export async function findRoomByCode(
  db: D1Database,
  inviteCode: string,
): Promise<RoomRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, invite_code, host_id FROM rooms WHERE invite_code = ?1 AND creation_visibility IN ('published','legacy')",
    )
    .bind(inviteCode)
    .first<{ id: string; invite_code: string; host_id: string }>();
  if (!row) return null;
  return { roomId: row.id, inviteCode: row.invite_code, hostId: row.host_id };
}

export async function findRoomById(
  db: D1Database,
  roomId: string,
): Promise<RoomRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, invite_code, host_id, created_at FROM rooms WHERE id = ?1 AND creation_visibility IN ('published','legacy')",
    )
    .bind(roomId)
    .first<{
      id: string;
      invite_code: string;
      host_id: string;
      created_at: string;
    }>();
  if (!row) return null;
  return {
    roomId: row.id,
    inviteCode: row.invite_code,
    hostId: row.host_id,
    createdAt: Date.parse(`${row.created_at.replace(" ", "T")}Z`),
  };
}

// ルーム行を削除する（ホストによる解散）。冪等: 無い id でも no-op。
export async function deleteRoom(
  db: D1Database,
  roomId: string,
): Promise<void> {
  await db.prepare("DELETE FROM rooms WHERE id = ?1").bind(roomId).run();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes("UNIQUE constraint failed")
  );
}
