import { generateInviteCode } from "../../contracts/invite-code";
import {
  type CreationIdentity,
  type CreationStatus,
  creationIssuedAt,
  ROOM_CREATION_FUTURE_MS,
  ROOM_CREATION_WINDOW_MS,
} from "../../contracts/room-creation";
import { SHARED_OUTCOME_RETENTION_MS } from "../../contracts/shared-outcomes";

export type CreationRequest = {
  user_id: string;
  request_id: string;
  name: string;
  room_id: string;
  invite_code: string;
  status: "pending" | "ready" | "closed";
  expires_at: number;
};
export type CreationControl = Omit<CreationRequest, "name" | "invite_code"> & {
  retry_at: number;
  attempts: number;
  legacy: number;
};
export class CreationConflict extends Error {}
export class CreationGone extends Error {}
export class CreationExpired extends Error {}
export class CreationUpdateRequired extends Error {}
// D1の秒精度は切上げて期限後予約を防ぐ（最大1秒早く閉じる）。
const DB_NOW = "((unixepoch()+1)*1000)";
export async function readCreationControl(
  db: D1Database,
  userId: string,
  requestId: string,
): Promise<CreationControl | null> {
  const rows = await db
    .prepare(
      "SELECT * FROM room_creation_control WHERE user_id=? AND lower(request_id)=?",
    )
    .bind(userId, requestId.toLowerCase())
    .all<CreationControl>();
  // 大小の旧二重行は勝者を勝手に選ばない。
  if (rows.results.length > 1) throw new CreationConflict();
  return rows.results[0] ?? null;
}
export async function readCreationRequest(
  db: D1Database,
  userId: string,
  requestId: string,
): Promise<CreationRequest | null> {
  const control = await readCreationControl(db, userId, requestId);
  if (!control) return null;
  const detail = await db
    .prepare(
      "SELECT name,invite_code FROM room_creation_requests WHERE user_id=? AND request_id=?",
    )
    .bind(userId, control.request_id)
    .first<{ name: string; invite_code: string }>();
  return detail ? { ...control, ...detail } : null;
}
export function creationIdentity(
  c: CreationControl | CreationRequest,
): CreationIdentity {
  return {
    creator: c.user_id,
    requestId: c.request_id.toLowerCase(),
    roomId: c.room_id,
    expiresAt: c.expires_at,
    legacy: "legacy" in c && c.legacy === 1,
  };
}
export async function reserveRoomCreation(
  db: D1Database,
  userId: string,
  requestId: string,
  name?: string,
  generateCode = generateInviteCode,
): Promise<CreationRequest> {
  requestId = requestId.toLowerCase();
  const normalizedName = name?.trim() || "";
  const policy = await db
    .prepare("SELECT retired_before FROM room_creation_policy WHERE id=1")
    .first<{ retired_before: number }>();
  if (!policy) throw new Error("作成受付policyを読み取れません。");
  const issuedAt = creationIssuedAt(requestId);
  const deadline =
    issuedAt === null ? null : issuedAt + ROOM_CREATION_WINDOW_MS;

  for (let attempt = 0; attempt < 10; attempt++) {
    const control = await readCreationControl(db, userId, requestId);
    if (control) {
      if (
        Date.now() >= control.expires_at ||
        control.expires_at <= policy.retired_before + ROOM_CREATION_WINDOW_MS
      )
        throw new CreationExpired();
      if (control.status === "closed") throw new CreationGone();
      const existing = await readCreationRequest(db, userId, requestId);
      if (!existing) throw new CreationExpired();
      if (existing.name !== normalizedName) throw new CreationConflict();
      const accepted = await db
        .prepare(
          "SELECT 1 FROM room_creation_policy WHERE id=1 AND retired_before+?<? AND ((unixepoch()+1)*1000)<?",
        )
        .bind(ROOM_CREATION_WINDOW_MS, control.expires_at, control.expires_at)
        .first();
      if (!accepted) throw new CreationExpired();
      return existing;
    }
    if (issuedAt !== null && issuedAt > Date.now() + ROOM_CREATION_FUTURE_MS)
      throw new CreationUpdateRequired();
    if (deadline === null) throw new CreationUpdateRequired();
    if (Date.now() >= deadline) throw new CreationExpired();
    const roomId = crypto.randomUUID(),
      inviteCode = generateCode(),
      now = Date.now();
    try {
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO room_creation_control(user_id,request_id,room_id,expires_at,status) SELECT ?,?,?,?,'pending' FROM room_creation_policy WHERE id=1 AND retired_before<? AND ${DB_NOW}<? AND ?<=${DB_NOW}+?`,
          )
          .bind(
            userId,
            requestId,
            roomId,
            deadline,
            issuedAt,
            deadline,
            issuedAt,
            ROOM_CREATION_FUTURE_MS,
          ),
        db
          .prepare(
            "INSERT INTO room_creation_requests(user_id,request_id,name,room_id,invite_code,status) SELECT user_id,request_id,?,room_id,?,'pending' FROM room_creation_control WHERE room_id=?",
          )
          .bind(normalizedName, inviteCode, roomId),
        db
          .prepare(
            "INSERT INTO rooms(id,invite_code,host_id,creation_visibility) SELECT room_id,?,user_id,'hidden' FROM room_creation_control WHERE room_id=?",
          )
          .bind(inviteCode, roomId),
        db
          .prepare(
            "INSERT INTO shared_outcomes(room_id,last_used_at,expires_at,creation_visibility) SELECT room_id,?,?,'hidden' FROM room_creation_control WHERE room_id=?",
          )
          .bind(now, now + SHARED_OUTCOME_RETENTION_MS, roomId),
      ]);
      if (results[0].meta.changes !== 1) throw new CreationExpired();
      return {
        user_id: userId,
        request_id: requestId,
        name: normalizedName,
        room_id: roomId,
        invite_code: inviteCode,
        status: "pending",
        expires_at: deadline,
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
export async function publishRoomCreation(
  db: D1Database,
  c: CreationControl | CreationRequest,
): Promise<void> {
  const result = await db.batch([
    db
      .prepare(
        "UPDATE shared_outcomes SET creation_visibility='published' WHERE room_id=? AND creation_visibility='hidden' AND EXISTS(SELECT 1 FROM rooms r JOIN room_creation_control c ON c.room_id=r.id WHERE r.id=? AND r.creation_visibility='hidden' AND c.user_id=? AND c.request_id=? AND c.status='pending')",
      )
      .bind(c.room_id, c.room_id, c.user_id, c.request_id),
    db
      .prepare(
        "UPDATE rooms SET creation_visibility='published' WHERE id=? AND creation_visibility='hidden' AND EXISTS(SELECT 1 FROM shared_outcomes s JOIN room_creation_control c ON c.room_id=s.room_id WHERE s.room_id=? AND s.creation_visibility='published' AND c.user_id=? AND c.request_id=? AND c.status='pending')",
      )
      .bind(c.room_id, c.room_id, c.user_id, c.request_id),
    db
      .prepare(
        "UPDATE room_creation_control SET status='ready' WHERE user_id=? AND request_id=? AND status='pending' AND EXISTS(SELECT 1 FROM rooms WHERE id=? AND creation_visibility='published')",
      )
      .bind(c.user_id, c.request_id, c.room_id),
    db
      .prepare(
        "UPDATE room_creation_requests SET status='ready' WHERE user_id=? AND request_id=? AND EXISTS(SELECT 1 FROM room_creation_control WHERE user_id=? AND request_id=? AND status='ready')",
      )
      .bind(c.user_id, c.request_id, c.user_id, c.request_id),
  ]);
  if (result[2].meta.changes !== 1) {
    const current = await readCreationControl(db, c.user_id, c.request_id);
    const visible = await db
      .prepare(
        "SELECT 1 FROM rooms WHERE id=? AND creation_visibility IN ('published','legacy')",
      )
      .bind(c.room_id)
      .first();
    if (current?.status !== "ready" || !visible) throw new CreationGone();
  }
}
export async function completeRoomCreation(
  db: D1Database,
  c: CreationRequest,
  initialize: () => Promise<void>,
): Promise<void> {
  if (
    !(await db
      .prepare("SELECT id FROM rooms WHERE id=?")
      .bind(c.room_id)
      .first())
  )
    throw new CreationGone();
  if (c.status === "ready") return;
  await initialize();
  await publishRoomCreation(db, c);
}
export async function getCreationStatus(
  db: D1Database,
  userId: string,
  requestId: string,
): Promise<CreationStatus> {
  const c = await readCreationControl(db, userId, requestId);
  const issued = creationIssuedAt(requestId);
  const policy = await db
    .prepare("SELECT retired_before FROM room_creation_policy WHERE id=1")
    .first<{ retired_before: number }>();
  if (!policy) throw new Error("作成受付policyを読み取れません。");
  const expiresAt =
    c?.expires_at ?? (issued === null ? 0 : issued + ROOM_CREATION_WINDOW_MS);
  const acceptance =
    Date.now() >= expiresAt ||
    expiresAt <= policy.retired_before + ROOM_CREATION_WINDOW_MS
      ? "expired"
      : "open";
  if (!c) return { kind: "unknown", acceptance };
  if (c.status === "closed") return { kind: "closed", acceptance };
  const room = await db
    .prepare("SELECT invite_code,creation_visibility FROM rooms WHERE id=?")
    .bind(c.room_id)
    .first<{ invite_code: string; creation_visibility: string }>();
  if (c.status === "ready")
    return room && room.creation_visibility !== "hidden"
      ? {
          kind: "ready",
          roomId: c.room_id,
          inviteCode: room.invite_code,
          acceptance,
        }
      : { kind: "closed", acceptance };
  return { kind: "unknown", acceptance };
}
export async function isCreationPublished(
  db: D1Database,
  roomId: string,
): Promise<boolean> {
  return Boolean(
    await db
      .prepare(
        "SELECT 1 FROM shared_outcomes WHERE room_id=?1 AND creation_visibility IN ('published','legacy') UNION ALL SELECT 1 FROM rooms WHERE id=?1 AND creation_visibility='legacy'",
      )
      .bind(roomId)
      .first(),
  );
}
