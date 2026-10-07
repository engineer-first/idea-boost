import { isUuid } from "../contracts/ids";
import {
  type SharedOutcomeSummary,
  SharedOutcomesQuerySchema,
} from "../contracts/shared-outcomes";
import type { ApiWorkerEnv } from "./api-worker";
import { isCreationPublished } from "./lib/room-creation";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
export async function handleSharedOutcomes(
  request: Request,
  env: ApiWorkerEnv,
): Promise<Response> {
  if (request.method !== "GET")
    return response({ error: "読み取り専用です。" }, 405);
  const url = new URL(request.url);
  const historyMatch = url.pathname.match(
    /^\/api\/shared-outcomes\/([^/]+)\/history(?:\/([^/]+))?$/,
  );
  if (historyMatch) {
    const [, roomId, recordId] = historyMatch;
    if (!isUuid(roomId) || (recordId && !isUuid(recordId)))
      return response({ error: "記録が見つかりません。" }, 404);
    if (!(await isCreationPublished(env.DB, roomId)))
      return response({ error: "記録が見つかりません。" }, 404);
    const rawCursor = url.searchParams.get("cursor");
    const cursor = rawCursor === null ? 0 : Number(rawCursor);
    if (!Number.isSafeInteger(cursor) || cursor < 0)
      return response({ error: "取得位置が不正です。" }, 400);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
    const record = recordId
      ? await stub.getProgressHistoryRecord(recordId)
      : await stub.getProgressHistory(cursor);
    return record
      ? response(record)
      : response(
          { error: "記録が見つからないか、保存期間が終了しました。" },
          404,
        );
  }
  const match = url.pathname.match(/^\/api\/shared-outcomes\/([^/]+)$/);
  if (match) {
    if (!isUuid(match[1]))
      return response({ error: "成果が見つかりません。" }, 404);
    if (!(await isCreationPublished(env.DB, match[1])))
      return response({ error: "成果が見つかりません。" }, 404);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(match[1]));
    const record = await stub.getSharedOutcome();
    return record
      ? response(record)
      : response(
          { error: "成果が見つからないか、保存期間が終了しました。" },
          404,
        );
  }
  if (url.pathname !== "/api/shared-outcomes")
    return response({ error: "not found" }, 404);
  const parsed = SharedOutcomesQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success)
    return response({ error: "検索条件または取得位置が不正です。" }, 400);
  const { q, status, phase, saveStatus, from, to, cursor } = parsed.data;
  const term = q.normalize("NFKC").toLocaleLowerCase("ja-JP");
  const fromTime = from
    ? Date.parse(`${from}T00:00:00+09:00`)
    : Number.NEGATIVE_INFINITY;
  const untilTime = to
    ? Date.parse(`${to}T00:00:00+09:00`) + 24 * 60 * 60 * 1000
    : Number.POSITIVE_INFINITY;
  const filtered = Boolean(
    term ||
      status !== "all" ||
      phase !== "all" ||
      saveStatus !== "all" ||
      from ||
      to,
  );
  const [timestamp, afterRoomId] = (cursor ?? "0").split(":");
  const offset = afterRoomId ? 0 : Number(timestamp);
  let position: { time: number; id: string } | null = afterRoomId
    ? { time: Number(timestamp), id: afterRoomId }
    : null;
  let scanned = 0;
  let hasMore = false;
  const outcomes: SharedOutcomeSummary[] = [];
  // 索引の保存失敗や古い投影でも検索から漏らさないよう、条件はRoomDOの現在の記録に適用する。
  // 一度に走査する候補は250件まで。続きはcursorで取得し、無制限のDO呼び出しを避ける。
  do {
    const size = Math.min(50 - outcomes.length, 250 - scanned);
    const candidates =
      await env.DB.prepare(`SELECT room_id, MAX(last_used_at) AS last_used_at, MAX(created_at) AS created_at FROM (
 SELECT room_id, last_used_at, NULL AS created_at FROM shared_outcomes
 UNION ALL SELECT id AS room_id, CAST(strftime('%s', created_at) AS INTEGER)*1000 AS last_used_at, created_at FROM rooms
 ) AS candidates WHERE (EXISTS (SELECT 1 FROM shared_outcomes s WHERE s.room_id=candidates.room_id AND s.creation_visibility IN ('published','legacy')) OR EXISTS (SELECT 1 FROM rooms r WHERE r.id=candidates.room_id AND r.creation_visibility='legacy')) GROUP BY room_id HAVING (? IS NULL OR MAX(last_used_at) < ? OR (MAX(last_used_at) = ? AND room_id > ?)) ORDER BY last_used_at DESC, room_id LIMIT ? OFFSET ?`)
        .bind(
          position?.time ?? null,
          position?.time ?? null,
          position?.time ?? null,
          position?.id ?? null,
          size + 1,
          position ? 0 : offset,
        )
        .all<{
          room_id: string;
          last_used_at: number;
          created_at: string | null;
        }>();
    const rows = candidates.results.slice(0, size);
    const records = await Promise.all(
      rows.map(async (row) => {
        const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(row.room_id));
        if (row.created_at)
          await stub.ensureSharedOutcome(
            row.room_id,
            Date.parse(`${row.created_at.replace(" ", "T")}Z`),
          );
        return stub.getSharedOutcome();
      }),
    );
    for (const record of records) {
      if (!record) continue;
      if (record.lastUsedAt < fromTime || record.lastUsedAt >= untilTime)
        continue;
      if (
        term &&
        ![record.name ?? "", record.displayId, record.roomId].some((value) =>
          value.normalize("NFKC").toLocaleLowerCase("ja-JP").includes(term),
        )
      )
        continue;
      if (status !== "all" && record.status !== status) continue;
      if (saveStatus !== "all" && record.saveStatus !== saveStatus) continue;
      if (
        phase !== "all" &&
        (phase === "lobby"
          ? record.phase.kind !== "lobby"
          : record.phase.kind !== "step" ||
            String(record.phase.phase) !== phase)
      )
        continue;
      const { snapshot: _, ...summary } = record;
      outcomes.push(summary);
    }
    scanned += rows.length;
    const last = rows.at(-1);
    if (last) position = { time: last.last_used_at, id: last.room_id };
    hasMore = candidates.results.length > size;
  } while (filtered && hasMore && scanned < 250 && outcomes.length < 50);
  outcomes.sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt || a.roomId.localeCompare(b.roomId),
  );
  return response({
    outcomes,
    nextCursor: hasMore && position ? `${position.time}:${position.id}` : null,
  });
}
