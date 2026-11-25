import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { RecentRoom } from "@/contracts/recent-rooms";

export type RecentRoomsSectionViewProps = {
  rooms: RecentRoom[];
  /** 進行中のルームを開いている途中。二重操作を防ぐ。 */
  opening?: boolean;
  loadFailed?: boolean;
  message?: string;
  onOpenActive: (roomId: string) => void;
  onRetry: () => void;
};

const rowClass =
  "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-base hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 disabled:border-dashed disabled:border-line-strong disabled:bg-background disabled:text-muted-foreground";

function formatCompletedDate(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(value);
}

function RoomRow({ room }: { room: RecentRoom }) {
  return (
    <>
      <span className="min-w-0 flex-1 break-words font-medium">
        {room.label}
      </span>
      <span className="shrink-0 text-sm text-muted-foreground">
        {room.status === "active"
          ? "進行中"
          : `完了${room.completedAt ? `・${formatCompletedDate(room.completedAt)}` : ""}`}
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </>
  );
}

// 本人が最近参加したルームの一覧。進行中を先に、完了は成果の閲覧へ進む。
// 完了ルームの全件はホームの「過去の成果を見る」から開くので、ここに同じ行き先のリンクを重ねない。
export function RecentRoomsSectionView({
  rooms,
  opening = false,
  loadFailed = false,
  message,
  onOpenActive,
  onRetry,
}: RecentRoomsSectionViewProps) {
  return (
    <section
      aria-labelledby="recent-rooms-heading"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <h2 id="recent-rooms-heading" className="text-base font-semibold">
        最近のルーム
      </h2>
      {loadFailed ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-base text-muted-foreground">
            ルームを読み込めませんでした。
          </p>
          <Button variant="outline" className="min-h-11" onClick={onRetry}>
            もう一度読み込む
          </Button>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {rooms.map((room) => (
            <li key={room.roomId}>
              {room.status === "active" ? (
                <button
                  type="button"
                  className={rowClass}
                  disabled={opening}
                  onClick={() => onOpenActive(room.roomId)}
                >
                  <RoomRow room={room} />
                </button>
              ) : (
                <Link
                  href={`/completed-rooms/${room.roomId}`}
                  className={rowClass}
                >
                  <RoomRow room={room} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" className="mt-3 text-base leading-relaxed">
          {message}
        </p>
      )}
    </section>
  );
}
