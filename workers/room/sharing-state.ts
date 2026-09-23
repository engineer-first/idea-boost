import type { RoomPhase } from "../../contracts/phase";
import {
  type ProtocolMember,
  type SharingState,
  SharingStateSchema,
} from "../../contracts/room-protocol";
import { isHostUser, listMembers } from "./members";

export function getSharingState(sql: SqlStorage): SharingState | null {
  const row = sql
    .exec("SELECT state_json FROM sharing_state WHERE id = 1")
    .toArray()[0];
  return row
    ? SharingStateSchema.parse(JSON.parse(String(row.state_json)))
    : null;
}

export function saveSharingState(sql: SqlStorage, state: SharingState): void {
  sql.exec(
    "INSERT INTO sharing_state (id, state_json) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json",
    JSON.stringify(state),
  );
}

export function resetSharingForPhase(sql: SqlStorage, phase: RoomPhase): void {
  const previous = getSharingState(sql);
  const sharing = phase.kind === "step" && phase.step === 2;
  if (!sharing && !previous) return;
  let order = previous?.order ?? [];
  if (sharing && order.length === 0) {
    const members = listMembers(sql);
    const host = members.find(({ userId }) => isHostUser(sql, userId));
    const others = members.filter(({ userId }) => !isHostUser(sql, userId));
    // Fisher–Yates は最初の共有への入場時だけ。進行役は抽選対象にしない。
    for (let index = others.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [others[index], others[target]] = [others[target], others[index]];
    }
    order = host ? [host, ...others] : others;
  }
  saveSharingState(sql, {
    revision: crypto.randomUUID(),
    order,
    status: sharing ? "ready" : "inactive",
    currentIndex: null,
    results: [],
    durationMs: previous?.durationMs ?? 180000,
    startsAt: null,
  });
}

export function appendSharingMember(
  sql: SqlStorage,
  member: ProtocolMember,
): boolean {
  const state = getSharingState(sql);
  if (!state) return false;
  const index = state.order.findIndex(({ userId }) => userId === member.userId);
  if (index >= 0) {
    if (state.order[index].name === member.name) return false;
    state.order[index] = member;
  } else {
    state.order.push(member);
    // 一巡後の途中参加もホストが明示的に開始する。
    if (state.status === "complete") state.status = "ready";
  }
  saveSharingState(sql, state);
  return true;
}
