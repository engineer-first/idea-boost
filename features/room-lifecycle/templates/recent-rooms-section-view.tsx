import { ArrowRight, CalendarDays, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { RecentRoom } from "@/contracts/recent-rooms";

export type RecentRoomsSectionViewProps = {
  rooms: RecentRoom[];
  /** 残り日数の基準にする現在時刻。stories で固定する。 */
  now?: number;
  /** 進行中のルームを開いている途中。二重操作を防ぐ。 */
  opening?: boolean;
  loadFailed?: boolean;
  message?: string;
  onOpenActive: (roomId: string) => void;
  onRetry: () => void;
};

const cardClass =
  "flex h-full min-h-11 w-full flex-col gap-2 rounded-lg border border-border bg-background p-3 text-left text-base hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 disabled:border-dashed disabled:border-line-strong disabled:bg-background disabled:text-muted-foreground";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatCompletedDate(value: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(value);
}

function remainingLabel(expiresAt: number, now: number): string {
  const days = Math.ceil((expiresAt - now) / DAY_MS);
  return days > 0 ? `あと${days}日で削除` : "まもなく削除";
}

function RoomCard({ room, now }: { room: RecentRoom; now: number }) {
  return (
    <>
      <span className="flex w-full items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span
            className="line-clamp-2 break-all font-medium"
            title={room.label}
          >
            {room.label}
          </span>
          <span className="text-sm text-muted-foreground">
            {room.status === "active"
              ? "進行中"
              : `完了${room.completedAt ? `・${formatCompletedDate(room.completedAt)}` : ""}`}
          </span>
        </span>
        <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden />
      </span>
      {/* 日付は分かるものだけ出す。古い記録で無くても名前と状態のカードとして成り立つ。 */}
      {(room.createdAt !== undefined || room.expiresAt !== undefined) && (
        <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums text-muted-foreground">
          {room.createdAt !== undefined && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              {formatCompletedDate(room.createdAt)} 作成
            </span>
          )}
          {room.expiresAt !== undefined && (
            <span
              className="inline-flex items-center gap-1"
              title={`${formatCompletedDate(room.expiresAt)}に自動で削除されます`}
            >
              <Trash2 className="size-4 shrink-0" aria-hidden />
              {remainingLabel(room.expiresAt, now)}
            </span>
          )}
        </span>
      )}
    </>
  );
}

// 本人が最近参加したルームの一覧。進行中を先に、完了は成果の閲覧へ進む。
// 完了ルームの全件はホームの「過去の成果を見る」から開くので、ここに同じ行き先のリンクを重ねない。
export function RecentRoomsSectionView({
  rooms,
  now = Date.now(),
  opening = false,
  loadFailed = false,
  message,
  onOpenActive,
  onRetry,
}: RecentRoomsSectionViewProps) {
  return (
    <section
      aria-labelledby="recent-rooms-heading"
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
    >
      <h2
        id="recent-rooms-heading"
        className="shrink-0 text-base font-semibold"
      >
        最近のルーム
      </h2>
      {loadFailed ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-base text-muted-foreground">
            ルームを読み込めませんでした。
          </p>
          <Button variant="outline" className="min-h-11" onClick={onRetry}>
            もう一度読み込む
          </Button>
        </div>
      ) : (
        // 最大3件。PC幅では横に並べ、作成・参加を初期画面から押し出さない。
        <ul className="grid min-w-0 gap-2 sm:grid-cols-3">
          {rooms.map((room) => (
            <li key={room.roomId} className="flex">
              {room.status === "active" ? (
                <button
                  type="button"
                  className={cardClass}
                  disabled={opening}
                  onClick={() => onOpenActive(room.roomId)}
                >
                  <RoomCard room={room} now={now} />
                </button>
              ) : (
                <Link
                  href={`/completed-rooms/${room.roomId}`}
                  className={cardClass}
                >
                  <RoomCard room={room} now={now} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" className="text-base leading-relaxed">
          {message}
        </p>
      )}
    </section>
  );
}
