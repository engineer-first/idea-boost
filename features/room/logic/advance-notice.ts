import {
  PHASE_STEP_COUNTS,
  type RoomPhase,
  type RoomStepPhase,
} from "@/contracts/phase";

// 「次のステップへ」で進む先。最終ステップ（3-5）の次は無い（成果の公開は別の操作）。
export function getNextStepPhase(phase: RoomPhase): RoomStepPhase | null {
  if (phase.kind !== "step") return null;
  if (phase.step < PHASE_STEP_COUNTS[phase.phase])
    return { ...phase, step: phase.step + 1 };
  if (phase.phase === 3) return null;
  return { kind: "step", phase: (phase.phase + 1) as 2 | 3, step: 1 };
}

// 予告の残り秒。配られた終了時刻を、サーバー時刻との差で手元の時計に合わせる。
export function getAdvanceNoticeSecondsLeft(
  endsAt: number,
  serverOffsetMs: number,
  now: number,
): number {
  return Math.max(0, Math.ceil((endsAt - (now + serverOffsetMs)) / 1000));
}
