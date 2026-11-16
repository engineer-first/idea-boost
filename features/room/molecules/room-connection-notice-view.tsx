import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
export type RoomConnectionNoticeViewProps = {
  status: RoomScreenConnectionStatus;
  className?: string;
  testId?: string;
  returnHref?: string;
};
// 待てば戻る接続はスピナーと一語だけで示し、利用者が動く必要がある停止だけ操作を出す。
export function RoomConnectionNoticeView({
  status,
  className,
  testId,
  returnHref,
}: RoomConnectionNoticeViewProps) {
  if (status === "open") return null;
  const stopped = status === "auth-required" || status === "unavailable";
  return (
    <div
      role="status"
      data-testid={testId}
      data-connection-stopped={stopped ? "true" : undefined}
      data-board-fit-edge={
        testId === "board-connection-status" ? "top" : undefined
      }
      className={className}
    >
      {stopped ? (
        <div className="flex flex-col items-start gap-1">
          <p className="font-semibold">
            {status === "auth-required"
              ? "接続が切れました"
              : "このルームは利用できません"}
          </p>
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <a href={status === "auth-required" ? (returnHref ?? "") : "/home"}>
              {status === "auth-required" ? "再読み込み" : "ホームへ戻る"}
            </a>
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-1.5">
          <Spinner />
          {status === "connecting" ? "接続中" : "再接続中"}
        </p>
      )}
    </div>
  );
}
