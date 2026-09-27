import { isUuid } from "../contracts/ids";
import type { SharedOutcomeSummary } from "../contracts/shared-outcomes";
import type { ApiWorkerEnv } from "./api-worker";

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
async function matches(actual: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const av = new Uint8Array(a),
    bv = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < av.length; i++) difference |= av[i] ^ bv[i];
  return difference === 0;
}
export async function handleSharedOutcomes(
  request: Request,
  env: ApiWorkerEnv,
): Promise<Response> {
  const expected = env.SHARED_OUTCOMES_TOKEN;
  const authorization = request.headers.get("Authorization") ?? "";
  if (
    !expected ||
    !authorization.startsWith("Bearer ") ||
    !(await matches(authorization.slice(7), expected))
  )
    return response({ error: "この閲覧リンクは利用できません。" }, 403);
  if (request.method !== "GET")
    return response({ error: "読み取り専用です。" }, 405);
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/shared-outcomes\/([^/]+)$/);
  if (match) {
    if (!isUuid(match[1]))
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
  const rawCursor = url.searchParams.get("cursor");
  const offset = rawCursor === null ? 0 : Number(rawCursor);
  if (!Number.isSafeInteger(offset) || offset < 0)
    return response({ error: "取得位置が不正です。" }, 400);
  // rooms の旧ルームも取り込み、成果索引の初回保存に失敗した場合も発見できる。
  const candidates =
    await env.DB.prepare(`SELECT room_id, MAX(last_used_at) AS last_used_at, MAX(created_at) AS created_at FROM (
 SELECT room_id, last_used_at, NULL AS created_at FROM shared_outcomes
 UNION ALL SELECT id AS room_id, CAST(strftime('%s', created_at) AS INTEGER)*1000 AS last_used_at, created_at FROM rooms
 ) GROUP BY room_id ORDER BY last_used_at DESC, room_id LIMIT 51 OFFSET ?`)
      .bind(offset)
      .all<{
        room_id: string;
        last_used_at: number;
        created_at: string | null;
      }>();
  const outcomes: SharedOutcomeSummary[] = [];
  for (const row of candidates.results.slice(0, 50)) {
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(row.room_id));
    if (row.created_at)
      await stub.ensureSharedOutcome(
        row.room_id,
        Date.parse(`${row.created_at.replace(" ", "T")}Z`),
      );
    const record = await stub.getSharedOutcome();
    if (record) {
      const { snapshot: _, ...summary } = record;
      outcomes.push(summary);
    }
  }
  outcomes.sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt || a.roomId.localeCompare(b.roomId),
  );
  return response({
    outcomes,
    nextCursor: candidates.results.length > 50 ? String(offset + 50) : null,
  });
}
