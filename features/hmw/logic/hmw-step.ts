// Step 2-1（HMW 個人執筆）の判定。container / view の双方が同じ判定を使い、
// マジックナンバー (phase=2, step=1) が呼び出し側に分散しないようにする。
import { isPhaseStep, type RoomPhase } from "@/contracts/phase";

export function isHmwWritingStep(phase: RoomPhase): boolean {
  return isPhaseStep(phase, 2, 1);
}
