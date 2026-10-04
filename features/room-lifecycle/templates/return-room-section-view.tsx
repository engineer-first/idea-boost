import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
export type ReturnRoomStatus = "idle" | "checking" | "retry" | "unavailable";
export type ReturnRoomSectionViewProps = {
  status: ReturnRoomStatus;
  onConfirm: () => void;
};
export function ReturnRoomSectionView({
  status,
  onConfirm,
}: ReturnRoomSectionViewProps) {
  return (
    <section
      aria-label="直前のルーム"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold">元のルームに戻る</h2>
        <p
          role="status"
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {status === "checking"
            ? "現在の参加状況を確認しています…"
            : status === "retry"
              ? "現在の参加状況を確認できません。しばらくしてから、もう一度確認してください。"
              : status === "unavailable"
                ? "このルームには戻れません。ルームが終了したか、参加・閲覧できなくなっています。"
                : "直前に参加したルームの現在の参加状況を確認して戻ります。"}
        </p>
      </div>
      {status !== "unavailable" && (
        <Button
          variant="outline"
          className="min-h-11 shrink-0"
          disabled={status === "checking"}
          onClick={onConfirm}
        >
          {status === "checking"
            ? "確認中…"
            : status === "retry"
              ? "もう一度確認する"
              : "元のルームに戻る"}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      )}
    </section>
  );
}
