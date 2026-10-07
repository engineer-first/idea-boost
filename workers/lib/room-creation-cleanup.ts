import {
  ROOM_CREATION_GC_GRACE_MS,
  ROOM_CREATION_WINDOW_MS,
} from "../../contracts/room-creation";
import type { ApiWorkerEnv } from "../api-worker";
import {
  type CreationControl,
  creationIdentity,
  publishRoomCreation,
} from "./room-creation";

// 手動照合もこの関数を使用。DO timeoutを未初期化の証拠にはしない。
export async function reconcileCreation(
  env: ApiWorkerEnv,
  c: CreationControl,
): Promise<void> {
  const decision = await env.ROOM_DO.get(
    env.ROOM_DO.idFromName(c.room_id),
  ).inspectOrCloseExpiredCreation(creationIdentity(c));
  if (decision === "ready") await publishRoomCreation(env.DB, c);
  else if (decision === "closed")
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE room_creation_control SET status='closed' WHERE user_id=? AND request_id=? AND status='pending'",
      ).bind(c.user_id, c.request_id),
      env.DB.prepare(
        "DELETE FROM rooms WHERE id=? AND creation_visibility='hidden' AND EXISTS(SELECT 1 FROM room_creation_control WHERE room_id=? AND status='closed')",
      ).bind(c.room_id, c.room_id),
      env.DB.prepare(
        "DELETE FROM shared_outcomes WHERE room_id=? AND creation_visibility='hidden' AND EXISTS(SELECT 1 FROM room_creation_control WHERE room_id=? AND status='closed')",
      ).bind(c.room_id, c.room_id),
    ]);
}
export async function cleanupRoomCreations(env: ApiWorkerEnv): Promise<void> {
  const enabled = await env.DB.prepare(
    "SELECT cleanup_enabled FROM room_creation_policy WHERE id=1",
  ).first<{ cleanup_enabled: number }>();
  if (enabled?.cleanup_enabled !== 1) {
    console.info("room_creation_cleanup_disabled");
    return;
  }
  // advance→deleteは同batch。単調watermarkを全新規予約のSQLも比較する。
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE room_creation_policy SET retired_before=MAX(retired_before,unixepoch()*1000-?) WHERE id=1",
    ).bind(ROOM_CREATION_WINDOW_MS + ROOM_CREATION_GC_GRACE_MS),
    env.DB.prepare(
      "DELETE FROM room_creation_requests WHERE room_id IN (SELECT c.room_id FROM room_creation_control c JOIN room_creation_requests d ON d.room_id=c.room_id WHERE c.expires_at <= (SELECT retired_before+? FROM room_creation_policy WHERE id=1) LIMIT 100)",
    ).bind(ROOM_CREATION_WINDOW_MS),
  ]);
  const due = await env.DB.prepare(
    "SELECT * FROM room_creation_control WHERE status='pending' AND expires_at<=unixepoch()*1000 AND retry_at<=unixepoch()*1000 ORDER BY retry_at,expires_at LIMIT 25",
  ).all<CreationControl>();
  for (const c of due.results) {
    const claim = await env.DB.prepare(
      "UPDATE room_creation_control SET retry_at=unixepoch()*1000+300000,attempts=attempts+1 WHERE user_id=? AND request_id=? AND status='pending' AND retry_at=?",
    )
      .bind(c.user_id, c.request_id, c.retry_at)
      .run();
    if (claim.meta.changes !== 1) continue;
    try {
      await reconcileCreation(env, c);
    } catch {
      // 個別失敗を隔離し、氏名/名前/cookieは出力しない。
      await env.DB.prepare(
        "UPDATE room_creation_control SET retry_at=unixepoch()*1000+? WHERE user_id=? AND request_id=? AND status='pending'",
      )
        .bind(
          Math.min(86400000, 3600000 * 2 ** Math.min(c.attempts, 5)),
          c.user_id,
          c.request_id,
        )
        .run();
      console.warn("room_creation_reconcile_failed", {
        roomId: c.room_id,
        attempt: c.attempts + 1,
      });
    }
  }
  // unknownは残す。ready/closed対応は通常room・成果がなく、受付も退役後だけ消す。
  await env.DB.prepare(
    "DELETE FROM room_creation_control WHERE room_id IN (SELECT room_id FROM room_creation_control WHERE status!='pending' AND expires_at <= (SELECT retired_before+? FROM room_creation_policy WHERE id=1) AND (substr(request_id,15,1)!='7' OR substr(replace(lower(request_id),'-',''),1,12)<=(SELECT printf('%012x',retired_before) FROM room_creation_policy WHERE id=1)) AND NOT EXISTS(SELECT 1 FROM rooms WHERE id=room_creation_control.room_id) AND NOT EXISTS(SELECT 1 FROM shared_outcomes WHERE room_id=room_creation_control.room_id AND expires_at>unixepoch()*1000) LIMIT 100)",
  )
    .bind(ROOM_CREATION_WINDOW_MS)
    .run();
  const metrics = await env.DB.prepare(
    "SELECT COUNT(*) AS unknown_count,MIN(expires_at) AS oldest_expiry,MAX(attempts) AS max_attempts FROM room_creation_control WHERE status='pending' AND expires_at<=unixepoch()*1000",
  ).first();
  console.info("room_creation_cleanup", metrics);
}
