import { getSharingState } from "./sharing-state";

// DO の alarm は一件だけなので、永続状態から最も早い期限を毎回選ぶ。
export async function syncRoomAlarm(
  storage: DurableObjectStorage,
  sql: SqlStorage,
): Promise<void> {
  const deadlines: number[] = [];
  const outcome = sql
    .exec(
      "SELECT expires_at, retry_at, (pending_json IS NOT NULL OR saved_json IS NOT NULL) AS has_content FROM shared_outcome_state WHERE id = 1",
    )
    .toArray()[0];
  if (typeof outcome?.retry_at === "number") deadlines.push(outcome.retry_at);
  if (
    typeof outcome?.expires_at === "number" &&
    outcome.expires_at > Date.now()
  )
    deadlines.push(outcome.expires_at);
  else if (
    typeof outcome?.expires_at === "number" &&
    outcome.has_content === 1 &&
    typeof outcome.retry_at !== "number"
  ) {
    // 投影の外部 I/O 中に期限を跨いでも、未削除の本文がある間は予約を失わない。
    // 削除失敗時は上の retry_at を尊重し、削除済みなら再予約しない。
    deadlines.push(Date.now() + 1);
  }

  const history = sql
    .exec("SELECT MIN(retry_at) AS retry_at FROM progress_history_outbox")
    .toArray()[0];
  if (
    typeof history?.retry_at === "number" &&
    typeof outcome?.expires_at === "number" &&
    outcome.expires_at > Date.now()
  )
    deadlines.push(history.retry_at);
  if (
    typeof outcome?.expires_at === "number" &&
    outcome.expires_at <= Date.now() &&
    sql.exec("SELECT 1 FROM progress_history LIMIT 1").toArray().length > 0 &&
    typeof outcome.retry_at !== "number"
  )
    deadlines.push(Date.now() + 1);

  const pending = sql
    .exec("SELECT deadline_at FROM pending_phase_transition WHERE id = 1")
    .toArray()[0];
  if (typeof pending?.deadline_at === "number")
    deadlines.push(pending.deadline_at);
  const sharing = getSharingState(sql);
  if (sharing?.startsAt !== null && sharing?.startsAt !== undefined)
    deadlines.push(sharing.startsAt);
  const timer = sql
    .exec("SELECT status, ends_at FROM timer_state WHERE id = 1")
    .toArray()[0];
  if (timer?.status === "running" && typeof timer.ends_at === "number")
    deadlines.push(timer.ends_at);
  if (deadlines.length === 0) await storage.deleteAlarm();
  else await storage.setAlarm(Math.min(...deadlines));
}
