import type { DotVoteKind } from "@/contracts/room-protocol";
import type { DotVoteFeedback, DotVoteRemaining } from "../logic/dot-vote";
import { DotVotePaletteView } from "../molecules/dot-vote-palette-view";

export type DotVotePaletteProps = {
  voteRemaining: DotVoteRemaining;
  pendingOperationCount: number;
  feedback: DotVoteFeedback | null;
  disabled: boolean;
  selectedKind: DotVoteKind | null;
  isReturnDropTarget?: boolean;
  onStickerSelect: (
    kind: DotVoteKind,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  onStickerDragStart: (
    kind: DotVoteKind,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
};

// 表示専用 view へ値を渡すだけの container。選択状態はボード側で持ち、
// クリックによる連続スタンプとドラッグ＆ドロップの両方を通知する。
export function DotVotePalette({
  voteRemaining,
  pendingOperationCount,
  feedback,
  disabled,
  selectedKind,
  isReturnDropTarget = false,
  onStickerSelect,
  onStickerDragStart,
}: DotVotePaletteProps) {
  return (
    <DotVotePaletteView
      voteRemaining={voteRemaining}
      pendingOperationCount={pendingOperationCount}
      feedback={feedback}
      disabled={disabled}
      selectedKind={selectedKind}
      isReturnDropTarget={isReturnDropTarget}
      onStickerSelect={onStickerSelect}
      onStickerDragStart={onStickerDragStart}
    />
  );
}
