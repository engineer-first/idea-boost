// RoomPhase を組み立てる spec / stories 共有のテストデータビルダー。
// 本番コードからは import しない（テスト・カタログ専用）。
import { type RoomPhase, RoomPhaseSchema, type RoomStepPhase } from "./phase";

export function buildLobbyPhase(): Extract<RoomPhase, { kind: "lobby" }> {
  return { kind: "lobby" };
}

export function buildPhaseStep(
  step: number,
  phase: RoomStepPhase["phase"] = 1,
): RoomStepPhase {
  return RoomPhaseSchema.parse({ kind: "step", phase, step }) as RoomStepPhase;
}
