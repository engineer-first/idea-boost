import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
export type ReturnRoomStatus =
  | "idle"
  | "checking"
  | "active"
  | "completed"
  | "retry"
  | "unavailable";
export type ReturnRoomSectionViewProps = {
  status: ReturnRoomStatus;
  onConfirm: () => void;
  hasCandidate?: boolean;
  previousRooms?: { id: string; label: string }[];
  onOpenPrevious?: (id: string) => void;
  historyMessage?: string;
};
export function ReturnRoomSectionView({
  status,
  onConfirm,
  hasCandidate = true,
  previousRooms = [],
  onOpenPrevious,
  historyMessage,
}: ReturnRoomSectionViewProps) {
  const title =
    status === "completed"
      ? "前回の成果を見る"
      : status === "active"
        ? "前のルームに戻る"
        : "前のルームを開く";
  return (
    <section
      aria-label="前のルーム"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      {hasCandidate && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold">{title}</h2>
            <p
              role="status"
              className="text-sm leading-relaxed text-muted-foreground"
            >
              {status === "checking"
                ? "ルームを確認しています…"
                : status === "retry"
                  ? "前のルームを確認できません。しばらくしてから、もう一度お試しください。"
                  : status === "unavailable"
                    ? "このルームには戻れません。ルームが終了したか、参加・閲覧できなくなっています。"
                    : status === "completed"
                      ? "前回の会は完了しています。成果を見返せます。"
                      : status === "active"
                        ? "前のルームに戻って作業を続けられます。"
                        : "以前のルームを確認して開きます。"}
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
                  : title}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      )}
      {previousRooms.length > 0 && (
        <details
          className={
            hasCandidate ? "mt-3 border-t border-border pt-3" : undefined
          }
        >
          <summary className="cursor-pointer text-sm font-medium">
            以前のルーム
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {previousRooms.map((room) => (
              <Button
                key={room.id}
                type="button"
                variant="outline"
                className="h-auto min-h-11 justify-start whitespace-normal break-words text-left"
                disabled={status === "checking"}
                onClick={() => onOpenPrevious?.(room.id)}
              >
                {room.label}
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </Button>
            ))}
          </div>
        </details>
      )}
      {historyMessage && (
        <p role="status" className="mt-3 text-sm leading-relaxed">
          {historyMessage}
        </p>
      )}
    </section>
  );
}
