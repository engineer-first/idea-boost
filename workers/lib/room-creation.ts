import { generateInviteCode } from "../../contracts/invite-code";
import { SHARED_OUTCOME_RETENTION_MS } from "../../contracts/shared-outcomes";

export type CreationRequest = {
  user_id: string;
  request_id: string;
  name: string;
  room_id: string;
  invite_code: string;
  status: "pending" | "ready";
};
export class CreationConflict extends Error {}
export class CreationGone extends Error {}

export function readCreationRequest(
  db: D1Database,
  userId: string,
  requestId: string,
): Promise<CreationRequest | null> {
  return db
    .prepare(
      "SELECT * FROM room_creation_requests WHERE user_id=? AND request_id=?",
    )
    .bind(userId, requestId)
    .first<CreationRequest>();
}

// 要求・ディレクトリ・成果投影の予約を同じD1 transactionで確定する。
// 競合時は勝者の要求を読む。招待コードだけの衝突なら再生成する。
export async function reserveRoomCreation(
  db: D1Database,
  userId: string,
  requestId: string,
  name?: string,
  generateCode = generateInviteCode,
): Promise<CreationRequest> {
  const normalizedName = name?.trim() || "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await readCreationRequest(db, userId, requestId);
    if (existing) {
      if (existing.name !== normalizedName) throw new CreationConflict();
      return existing;
    }
    const roomId = crypto.randomUUID();
    const inviteCode = generateCode();
    const now = Date.now();
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO room_creation_requests(user_id,request_id,name,room_id,invite_code,status) VALUES(?,?,?,?,?,'pending')",
          )
          .bind(userId, requestId, normalizedName, roomId, inviteCode),
        db
          .prepare("INSERT INTO rooms(id,invite_code,host_id) VALUES(?,?,?)")
          .bind(roomId, inviteCode, userId),
        db
          .prepare(
            "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at) VALUES(?,?,?)",
          )
          .bind(roomId, now, now + SHARED_OUTCOME_RETENTION_MS),
      ]);
      return {
        user_id: userId,
        request_id: requestId,
        name: normalizedName,
        room_id: roomId,
        invite_code: inviteCode,
        status: "pending",
      };
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed")
        )
      )
        throw error;
    }
  }
  throw new Error("ルーム作成の予約に失敗しました。");
}

export async function completeRoomCreation(
  db: D1Database,
  creation: CreationRequest,
  initialize: () => Promise<void>,
): Promise<void> {
  // ルームを削除した後も対応表は残る。再生成・DO再初期化はしない。
  const exists = await db
    .prepare("SELECT id FROM rooms WHERE id=?")
    .bind(creation.room_id)
    .first();
  if (!exists) throw new CreationGone();
  if (creation.status === "ready") return;
  await initialize();
  await db
    .prepare(
      "UPDATE room_creation_requests SET status='ready' WHERE user_id=? AND request_id=?",
    )
    .bind(creation.user_id, creation.request_id)
    .run();
}
