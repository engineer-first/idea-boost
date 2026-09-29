import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { CompletedRoomSummary } from "@/contracts/completed-rooms";
import { formatCompletedDate } from "./completed-rooms-content";
export type CompletedRoomsViewProps = {
  rooms: CompletedRoomSummary[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onRetry: () => void;
  onMore: () => void;
};
export function CompletedRoomsView({
  rooms,
  loading,
  error,
  hasMore,
  onRetry,
  onMore,
}: CompletedRoomsViewProps) {
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/home"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          ホームへ
        </Link>
        <header>
          <h1 className="text-3xl font-bold">以前のルーム</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            完了したときに参加していたルームを、完了から30日間見返せます。
          </p>
        </header>
        <ul className="space-y-4">
          {rooms.map((room) => (
            <li
              key={room.roomId}
              className="min-w-0 rounded-xl border bg-card p-5 sm:p-6"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                採用したアイデア
              </p>
              <h2 className="mt-2 line-clamp-3 whitespace-pre-wrap text-lg font-semibold leading-7 [overflow-wrap:anywhere]">
                {room.idea}
              </h2>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">
                    完了日時（日本時間）
                  </dt>
                  <dd>
                    <time dateTime={new Date(room.completedAt).toISOString()}>
                      {formatCompletedDate(room.completedAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    閲覧期限（日本時間）
                  </dt>
                  <dd>
                    <time dateTime={new Date(room.expiresAt).toISOString()}>
                      {formatCompletedDate(room.expiresAt)}
                    </time>
                  </dd>
                </div>
              </dl>
              <Link
                href={`/completed-rooms/${room.roomId}`}
                className="mt-5 inline-flex min-h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                成果を見る
              </Link>
            </li>
          ))}
        </ul>
        {loading && (
          <p role="status" aria-live="polite">
            以前のルームを読み込み中…
          </p>
        )}
        {error && (
          <div className="rounded-xl border border-destructive/40 p-4">
            <p role="alert">{error}</p>
            <Button
              className="mt-3 min-h-11"
              variant="outline"
              onClick={onRetry}
              disabled={loading}
            >
              再取得
            </Button>
          </div>
        )}
        {!loading && !error && rooms.length === 0 && (
          <p className="rounded-xl border bg-muted/30 p-6">
            {hasMore
              ? "このページに表示できるルームはありません。続きのルームを確認してください。"
              : "以前のルームはまだありません。"}
          </p>
        )}
        {hasMore && !error && (
          <Button
            className="min-h-11"
            variant="outline"
            disabled={loading}
            onClick={onMore}
          >
            次のルームを表示
          </Button>
        )}
      </div>
    </main>
  );
}
