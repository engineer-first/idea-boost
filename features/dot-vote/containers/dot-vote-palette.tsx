import type { DotVoteKind } from "@/contracts/room-protocol";
import type { DotVoteFeedback, DotVoteRemaining } from "../logic/dot-vote";
import { DotVotePaletteView } from "../molecules/dot-vote-palette-view";

export type DotVotePaletteProps = {
  voteRemaining: DotVoteRemaining;
  pendingOperationCount: number;
  feedback: DotVoteFeedback | null;
  disabled: boolean;
  onStickerDragStart: (
    kind: DotVoteKind,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
};

// 表示専用 view へ値を渡すだけの container。クリック選択状態を持たず、
// シールは常にここから付箋へドラッグして投票する。
export function DotVotePalette({
  voteRemaining,
  pendingOperationCount,
  feedback,
  disabled,
  onStickerDragStart,
}: DotVotePaletteProps) {
  return (
    <DotVotePaletteView
      voteRemaining={voteRemaining}
      pendingOperationCount={pendingOperationCount}
      feedback={feedback}
      disabled={disabled}
      onStickerDragStart={onStickerDragStart}
    />
  );
}
