import { z } from "zod";
import { PERMISSIONS } from "../contracts/access";
import {
  FEEDBACK_RETENTION_MS,
  FeedbackInputSchema,
  FeedbackKindSchema,
  type FeedbackList,
  type FeedbackRecord,
  FeedbackTargetSchema,
  isFreshFeedbackId,
} from "../contracts/feedback";
import { isUuid } from "../contracts/ids";
import type { SessionPayload } from "../contracts/session";
import type { ApiWorkerEnv } from "./api-worker";
import { hasPermission } from "./lib/access";
import { findRoomById } from "./lib/db";
import { hashFeedbackReceipt } from "./lib/feedback-receipt";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
export async function acceptFeedback(
  request: Request,
  env: ApiWorkerEnv,
  session: SessionPayload,
  roomId: string,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "利用できない操作です。" }, 405);
  if (
    !isUuid(roomId) ||
    !(await findRoomById(env.DB, roomId)) ||
    !(await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).isMember(
      session.sub,
    ))
  )
    return json(
      {
        error: "参加中のルームを確認できません。退出・解散後は送信できません。",
      },
      404,
    );
  const parsed = FeedbackInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return json(
      { error: "対象・種類・2000文字以内の本文・評価を確認してください。" },
      400,
    );
  const input = parsed.data;
  const now = Date.now();
  const existing = await env.DB.prepare("SELECT id FROM feedback WHERE id=?")
    .bind(input.id)
    .first<{ id: string }>();
  if (!existing && !isFreshFeedbackId(input.id, now))
    return json(
      {
        error:
          "受付IDの有効期間を過ぎています。端末の日時を確認し、新しい意見として送信してください。",
      },
      409,
    );
  await env.DB.prepare(
    "INSERT INTO feedback(id,id_hash,room_id,target,kind,body,rating,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
  )
    .bind(
      input.id,
      await hashFeedbackReceipt(input.id),
      roomId,
      input.target,
      input.kind,
      input.body,
      input.rating,
      now,
      now + FEEDBACK_RETENTION_MS,
    )
    .run();
  const record = await env.DB.prepare(
    "SELECT room_id,target,kind,body,rating,expires_at FROM feedback WHERE id=?",
  )
    .bind(input.id)
    .first<{
      room_id: string;
      target: string;
      kind: string;
      body: string;
      rating: number | null;
      expires_at: number;
    }>();
  if (
    !record ||
    record.expires_at <= now ||
    record.room_id !== roomId ||
    record.target !== input.target ||
    record.kind !== input.kind ||
    record.body !== input.body ||
    record.rating !== input.rating
  )
    return json(
      {
        error:
          "この受付IDは使えません。入力を確認して、新しい意見として送信してください。",
      },
      409,
    );
  return json({ ok: true, id: input.id });
}
const QuerySchema = z
  .object({
    kind: FeedbackKindSchema.optional(),
    target: FeedbackTargetSchema.optional(),
    from: z.coerce
      .number()
      .int()
      .nonnegative()
      .max(8640000000000000)
      .optional(),
    to: z.coerce.number().int().nonnegative().max(8640000000000000).optional(),
    cursor: z.string().max(120).optional(),
  })
  .strict()
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to);
const CursorSchema = z
  .object({ at: z.number().int().nonnegative(), id: z.string().uuid() })
  .strict();
export async function listFeedback(
  request: Request,
  env: ApiWorkerEnv,
  session: SessionPayload,
): Promise<Response> {
  if (!(await hasPermission(env.DB, session.sub, PERMISSIONS.readFeedback)))
    return json({ error: "意見の閲覧権限がありません。" }, 403);
  if (request.method !== "GET")
    return json({ error: "読み取り専用です。" }, 405);
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return json({ error: "絞り込み条件を確認してください。" }, 400);
  const q = parsed.data,
    clauses = ["expires_at > ?"],
    values: Array<string | number> = [Date.now()];
  for (const [name, value] of [
    ["kind", q.kind],
    ["target", q.target],
  ] as const) {
    if (value !== undefined) {
      clauses.push(`${name} = ?`);
      values.push(value);
    }
  }
  if (q.from !== undefined) {
    clauses.push("created_at >= ?");
    values.push(q.from);
  }
  if (q.to !== undefined) {
    clauses.push("created_at <= ?");
    values.push(q.to);
  }
  if (q.cursor) {
    let raw: unknown;
    try {
      raw = JSON.parse(q.cursor);
    } catch {
      return json({ error: "取得位置を確認してください。" }, 400);
    }
    const cursor = CursorSchema.safeParse(raw);
    if (!cursor.success)
      return json({ error: "取得位置を確認してください。" }, 400);
    clauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
    values.push(cursor.data.at, cursor.data.at, cursor.data.id);
  }
  const rows = await env.DB.prepare(
    `SELECT id,room_id AS roomId,target,kind,body,rating,created_at AS createdAt,expires_at AS expiresAt FROM feedback WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT 51`,
  )
    .bind(...values)
    .all<FeedbackRecord>();
  const items = rows.results.slice(0, 50),
    last = items.at(-1);
  const result: FeedbackList = {
    items,
    nextCursor:
      rows.results.length > 50 && last
        ? JSON.stringify({ at: last.createdAt, id: last.id })
        : null,
    canReadOutcomes: await hasPermission(
      env.DB,
      session.sub,
      PERMISSIONS.readSharedOutcomes,
    ),
  };
  return json(result);
}
export async function deleteExpiredFeedback(
  db: D1Database,
  now = Date.now(),
): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM feedback WHERE expires_at <= ?").bind(now),
    // 鮮度窓の終端は受理可能なので、その時刻を過ぎてから失効記録を削除する。
    db
      .prepare("DELETE FROM feedback_revocations WHERE expires_at < ?")
      .bind(now),
  ]);
}
