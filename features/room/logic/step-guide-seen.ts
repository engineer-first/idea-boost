import { getStepGuideRevision } from "./step-guide-copy";

// ステップガイドを一度開いた記録の保存先（localStorage）のキー。
// ルームをまたいで同じ本人には再表示しない。版の上げ方は step-guide-copy.ts を参照する。
export function stepGuideSeenStorageKey(
  userId: string,
  phaseKey: string,
  revision: number = getStepGuideRevision(phaseKey),
): string {
  return `step-guide-seen:${userId}:${phaseKey}:r${revision}`;
}
