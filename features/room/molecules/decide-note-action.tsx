import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("app.boardDecide");
  return (
    <Button
      type="button"
      size="icon-lg"
      variant="outline"
      aria-label={t("selectChallenge")}
      title={t("selectChallenge")}
      className="absolute z-30 rounded-full bg-background/90 shadow-tool"
      style={{ left: x, top: y }}
      onClick={onDecide}
    >
      <Check aria-hidden="true" />
    </Button>
  );
}
