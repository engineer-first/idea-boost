import { getSharingState } from "./sharing-state";

// DO の alarm は一件だけなので、永続状態から最も早い期限を毎回選ぶ。
export async function syncRoomAlarm(
  storage: DurableObjectStorage,
  sql: SqlStorage,
): Promise<void> {
  const deadlines: number[] = [];
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
