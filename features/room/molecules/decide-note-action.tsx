import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export const DECIDE_NOTE_ACTION_SIZE = 36;
export const DECIDE_NOTE_ACTION_INSET = 4;

export type DecideNoteActionProps = {
  x: number;
  y: number;
  onDecide: () => void;
};

// 表示条件と付箋右上の座標は親のキャンバスが持つ。これは選択済み付箋の
// 決定操作だけを担う。決定済み表示は NoteCard 側の非操作statusとし、
// 同じ場所に二重に表示しない。
export function DecideNoteAction({ x, y, onDecide }: DecideNoteActionProps) {
  return (
    <Button
      type="button"
      size="icon-lg"
      variant="outline"
      aria-label="この付箋を取り組む課題に決定"
      title="この付箋を取り組む課題に決定"
      className="absolute z-30 rounded-full bg-background/90 shadow-sm"
      style={{ left: x, top: y }}
      onClick={onDecide}
    >
      <Check aria-hidden="true" />
    </Button>
  );
}
