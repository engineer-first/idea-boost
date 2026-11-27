import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export type ReturnRoomStatus =
  | "identity_unavailable"
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
  const t = useTranslations("app.home");
  const title =
    status === "completed"
      ? t("previousOutcome")
      : status === "active"
        ? t("returnPrevious")
        : t("openPrevious");
  return (
    <section
      aria-label={t("previousRoom")}
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      {hasCandidate && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold">{title}</h2>
            <p
              role="status"
              className="text-base leading-relaxed text-muted-foreground"
            >
              {status === "identity_unavailable"
                ? t("identityUnavailable")
                : status === "checking"
                  ? t("checking")
                  : status === "retry"
                    ? t("retryPrevious")
                    : status === "unavailable"
                      ? t("unavailablePrevious")
                      : status === "completed"
                        ? t("completedPrevious")
                        : status === "active"
                          ? t("activePrevious")
                          : t("previousDescription")}
            </p>
          </div>
          {status !== "unavailable" && status !== "identity_unavailable" && (
            <Button
              variant="outline"
              className="min-h-11 shrink-0"
              disabled={status === "checking"}
              onClick={onConfirm}
            >
              {status === "checking"
                ? t("confirming")
                : status === "retry"
                  ? t("confirmAgain")
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
          <summary className="cursor-pointer text-base font-medium">
            {t("previousRooms")}
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
        <p role="status" className="mt-3 text-base leading-relaxed">
          {historyMessage}
        </p>
      )}
    </section>
  );
}
