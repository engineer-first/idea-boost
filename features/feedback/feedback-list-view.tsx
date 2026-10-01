"use client";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import {
  FEEDBACK_KINDS,
  FEEDBACK_TARGETS,
  type FeedbackRecord,
} from "@/contracts/feedback";
export type FeedbackFilters = {
  kind: string;
  target: string;
  from: string;
  to: string;
};
export type FeedbackListViewProps = {
  items: FeedbackRecord[];
  filters: FeedbackFilters;
  loading: boolean;
  error: string | null;
  nextCursor: string | null;
  canReadOutcomes: boolean;
  onFilter: (patch: Partial<FeedbackFilters>) => void;
  onRefresh: () => void;
  onRetry: () => void;
  onMore: () => void;
};
export function FeedbackListView({
  items,
  filters,
  loading,
  error,
  nextCursor,
  canReadOutcomes,
  onFilter,
  onRefresh,
  onRetry,
  onMore,
}: FeedbackListViewProps): ReactElement {
  const failure = error ? (
    <div role="alert" className="space-y-2">
      <p>{error}</p>
      {items.length ? (
        <p className="text-sm text-muted-foreground">
          表示済みの意見は残っています。続きから再試行できます。
        </p>
      ) : null}
      <Button variant="outline" disabled={loading} onClick={onRetry}>
        再試行
      </Button>
    </div>
  ) : null;
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="text-sm text-muted-foreground">
            Idea Boost · 改善のための記録
          </p>
          <h1 className="mt-2 text-2xl font-semibold">利用者の意見</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            任意で届いた投稿です。投稿件数は人数ではなく、無回答は好評や問題なしを表しません。送信から30日間表示します。
          </p>
        </header>
        <div className="grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            種類で絞る
            <select
              className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2"
              value={filters.kind}
              onChange={(e) => onFilter({ kind: e.target.value })}
            >
              <option value="">すべて</option>
              {Object.entries(FEEDBACK_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            対象で絞る
            <select
              className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2"
              value={filters.target}
              onChange={(e) => onFilter({ target: e.target.value })}
            >
              <option value="">すべて</option>
              {FEEDBACK_TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm">
            送信日時（開始）
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => onFilter({ from: e.target.value })}
              className="mt-1 block min-h-11 w-full min-w-0 rounded-md border bg-background px-2"
            />
          </label>
          <label className="min-w-0 text-sm">
            送信日時（終了）
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => onFilter({ to: e.target.value })}
              className="mt-1 block min-h-11 w-full min-w-0 rounded-md border bg-background px-2"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={onRefresh} disabled={loading}>
            更新
          </Button>
          <p className="text-xs text-muted-foreground">
            日時はお使いの端末の時刻です。
          </p>
        </div>
        {loading ? <p role="status">読み込み中…</p> : null}
        {!items.length ? failure : null}
        {!loading && !error && items.length === 0 ? (
          <p>条件に合う意見はありません。</p>
        ) : null}
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="min-w-0 space-y-3 rounded-xl border bg-background p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-1 text-sm font-semibold">
                  {FEEDBACK_KINDS[item.kind]}
                </span>
                <span className="text-sm">
                  {FEEDBACK_TARGETS.find((t) => t.value === item.target)
                    ?.label ?? "ステップ不明"}
                </span>
                <time
                  dateTime={new Date(item.createdAt).toISOString()}
                  className="ml-auto text-xs text-muted-foreground"
                >
                  {new Date(item.createdAt).toLocaleString("ja-JP")}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">
                {item.body || "文章なし（種類のみ）"}
              </p>
              {item.target === "app" ? (
                <p className="text-sm">
                  使いやすさ：
                  <span className="font-semibold">
                    {item.rating === null ? "未回答" : `${item.rating} / 5`}
                  </span>
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                <p className="min-w-0 break-all text-xs text-muted-foreground">
                  ルームID：{item.roomId}
                </p>
                {canReadOutcomes ? (
                  <a
                    className="text-xs underline"
                    href={`/shared-outcomes?roomId=${encodeURIComponent(item.roomId)}`}
                  >
                    共有成果を見る
                  </a>
                ) : null}
              </div>
              <p className="break-all text-xs text-muted-foreground">
                受付ID：{item.id} · 期限：
                {new Date(item.expiresAt).toLocaleString("ja-JP")}
              </p>
            </li>
          ))}
        </ul>
        {items.length ? failure : null}
        {!error && nextCursor ? (
          <Button variant="outline" disabled={loading} onClick={onMore}>
            さらに表示
          </Button>
        ) : null}
      </div>
    </main>
  );
}
