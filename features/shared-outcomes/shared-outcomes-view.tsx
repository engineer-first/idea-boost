"use client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Link,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { type RefObject, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoomPhaseLabel } from "@/contracts/phase";
import type {
  SharedOutcomeFilters,
  SharedOutcomeRecord,
  SharedOutcomeSummary,
} from "@/contracts/shared-outcomes";
import {
  ProgressHistoryView,
  type ProgressHistoryViewProps,
} from "./progress-history-view";
import { SharedOutcomeBoard } from "./shared-outcome-board";
import {
  formatOutcomeTime,
  PHASE_LABELS,
  SAVE_STATUS_LABELS,
} from "./shared-outcomes-content";
import { SharedOutcomesFilters } from "./shared-outcomes-filters";
import {
  DEFAULT_OUTCOME_FILTERS,
  outcomeHref,
  outcomeParams,
} from "./shared-outcomes-query";
export type SharedOutcomesViewProps = {
  mainRef?: RefObject<HTMLElement | null>;
  roomId?: string;
  filters?: SharedOutcomeFilters;
  loadingMore?: boolean;
  paginationError?: boolean;
  onSearch?: (filters: SharedOutcomeFilters) => void;
  onRetry?: () => void;
  onAdjacent?: (id: string) => void;
  onCopyLink?: () => void;
  copyMessage?: string | null;
  history?: ProgressHistoryViewProps;
  loading: boolean;
  error: string | null;
  outcomes: SharedOutcomeSummary[];
  detail: SharedOutcomeRecord | null;
  nextCursor: string | null;
  onOpen: (id: string) => void;
  onBack: () => void;
  onRefresh: () => void;
  onMore: () => void;
};
export function SharedOutcomesView({
  mainRef,
  roomId,
  filters = DEFAULT_OUTCOME_FILTERS,
  loadingMore = false,
  paginationError = false,
  onSearch,
  onRetry,
  onAdjacent,
  onCopyLink,
  copyMessage,
  history,
  loading,
  error,
  outcomes,
  detail,
  nextCursor,
  onOpen,
  onBack,
  onRefresh,
  onMore,
}: SharedOutcomesViewProps) {
  const historyRef = useRef<HTMLDivElement>(null);
  function openHistory(): void {
    const heading = historyRef.current?.querySelector("h2");
    heading?.focus();
    heading?.scrollIntoView?.({ block: "start" });
  }
  const selectedId = roomId ?? detail?.roomId;
  const detailMode = Boolean(selectedId);
  const summary =
    detail ?? outcomes.find((outcome) => outcome.roomId === selectedId);
  const selectedIndex = outcomes.findIndex(
    (outcome) => outcome.roomId === selectedId,
  );
  const adjacent =
    selectedIndex < 0
      ? []
      : [outcomes[selectedIndex - 1], outcomes[selectedIndex + 1]];
  const filtered = outcomeParams(filters).size > 0;
  const busy = loading || loadingMore;
  return (
    <main
      ref={mainRef}
      className="flex-1 overflow-y-auto bg-muted/30 p-4 selection:bg-primary selection:text-primary-foreground sm:p-8"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1
              tabIndex={-1}
              className="break-words text-2xl font-semibold tracking-tight focus:outline-none"
            >
              {summary
                ? summary.name || `ルーム #${summary.displayId}`
                : detailMode
                  ? "成果の詳細"
                  : "共有成果"}
            </h1>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {detailMode
                ? "決定した内容と共有ボード、進行の記録を確認できます。"
                : "ルームに残された成果を、名前・ID・進行状況・利用日から探せます。"}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={onRefresh}
            className="min-h-11"
          >
            <RefreshCw aria-hidden />
            最新の状態を取得
          </Button>
        </header>
        {detailMode && (
          <nav
            aria-label="成果と進行記録の移動"
            className="flex flex-wrap gap-2"
          >
            <Button variant="ghost" onClick={onBack} className="min-h-11">
              <ArrowLeft aria-hidden />
              成果一覧へ戻る
            </Button>
            {detail && history && (
              <Button
                variant="outline"
                onClick={openHistory}
                disabled={loading}
                className="min-h-11"
              >
                進行の記録を見る
              </Button>
            )}
            {onCopyLink && (
              <Button
                variant="outline"
                className="min-h-11"
                onClick={onCopyLink}
              >
                <Link aria-hidden />
                リンクをコピー
              </Button>
            )}
            {onAdjacent && selectedIndex >= 0 && (
              <div className="flex gap-2 sm:ml-auto">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={busy || !adjacent[0]}
                  onClick={() => adjacent[0] && onAdjacent(adjacent[0].roomId)}
                >
                  <ChevronLeft aria-hidden />
                  前の成果
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={busy || !adjacent[1]}
                  onClick={() => adjacent[1] && onAdjacent(adjacent[1].roomId)}
                >
                  次の成果
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            )}
          </nav>
        )}
        {detailMode && copyMessage && (
          <p role="status" className="text-sm text-muted-foreground">
            {copyMessage}
          </p>
        )}
        {!detailMode && onSearch && (
          <SharedOutcomesFilters filters={filters} onSearch={onSearch} />
        )}

        {loading && (detailMode || outcomes.length === 0) && (
          <p role="status" className="rounded-xl border bg-card p-8">
            成果を読み込んでいます…
          </p>
        )}
        {error && !paginationError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-card p-6 text-destructive"
          >
            <p>{error}</p>
            <Button
              variant="outline"
              className="mt-3 min-h-11"
              onClick={onRetry ?? onRefresh}
            >
              再試行
            </Button>
          </div>
        )}
        {!detailMode && (outcomes.length > 0 || (!loading && !error)) && (
          <section aria-label="成果一覧" aria-busy={busy} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p role="status" className="text-sm font-medium tabular-nums">
                {loading
                  ? "一覧を更新しています…"
                  : `${outcomes.length}件${nextCursor ? "を表示中" : filtered ? "の検索結果" : "の成果"}`}
              </p>
              <p className="text-sm text-muted-foreground">
                最終利用が新しい順
              </p>
            </div>
            {outcomes.length > 0 && (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div
                  aria-hidden
                  className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_11rem_11rem_1.25rem] gap-4 border-b bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground xl:grid"
                >
                  <span>ルーム / 記録</span>
                  <span>到達点</span>
                  <span>最終利用 / 最後の保存</span>
                  <span>閲覧期限</span>
                  <span />
                </div>
                <ul className="divide-y">
                  {outcomes.map((outcome) => (
                    <li key={outcome.roomId}>
                      <a
                        href={outcomeHref(filters, outcome.roomId)}
                        data-room-id={outcome.roomId}
                        onClick={(event) => {
                          if (
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.shiftKey &&
                            !event.altKey &&
                            event.button === 0
                          ) {
                            event.preventDefault();
                            onOpen(outcome.roomId);
                          }
                        }}
                        className="group grid min-w-0 gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:p-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_11rem_11rem_1.25rem] xl:items-center xl:gap-4"
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <h2 className="min-w-0 break-words font-semibold group-hover:underline group-hover:underline-offset-4">
                              {outcome.name || `ルーム #${outcome.displayId}`}
                            </h2>
                            <ArrowRight
                              className="size-5 shrink-0 xl:hidden"
                              aria-hidden
                            />
                          </div>
                          <p className="font-mono text-xs text-muted-foreground">
                            {outcome.displayId}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-medium">
                              {outcome.status === "confirmed" && (
                                <Check className="size-3" aria-hidden />
                              )}
                              {outcome.status === "confirmed" ? "確定" : "途中"}
                            </span>
                            <span
                              className={
                                outcome.saveStatus === "saved"
                                  ? "text-muted-foreground"
                                  : "font-medium text-amber-800"
                              }
                            >
                              {SAVE_STATUS_LABELS[outcome.saveStatus]}
                            </span>
                          </div>
                        </div>
                        <p className="break-words text-sm">
                          <span className="mr-2 text-muted-foreground xl:hidden">
                            到達点
                          </span>
                          {getRoomPhaseLabel(outcome.phase)}
                        </p>
                        <div className="space-y-1 text-sm tabular-nums">
                          <p>
                            <span className="mr-2 text-muted-foreground xl:hidden">
                              最終利用
                            </span>
                            {formatOutcomeTime(outcome.lastUsedAt)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            保存：
                            {outcome.lastSavedAt === null
                              ? "保存なし"
                              : formatOutcomeTime(outcome.lastSavedAt)}
                          </p>
                        </div>
                        <p className="text-sm tabular-nums text-muted-foreground">
                          <span className="mr-2 xl:hidden">閲覧期限</span>
                          {formatOutcomeTime(outcome.expiresAt)}
                        </p>
                        <ArrowRight
                          className="hidden size-5 xl:block"
                          aria-hidden
                        />
                        {outcome.saveStatus !== "saved" && (
                          <p className="text-sm leading-relaxed text-amber-800 xl:col-span-5">
                            {outcome.lastSavedAt
                              ? "前回の正常保存分を表示します。"
                              : "正常保存分はまだありません。"}
                            サーバーが自動で再試行します。
                          </p>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outcomes.length === 0 && (
              <div className="space-y-3 rounded-xl border bg-card px-6 py-10 text-center">
                <h2 className="font-semibold">
                  {filtered
                    ? nextCursor
                      ? "ここまでに一致する成果はありません"
                      : "条件に一致する成果はありません"
                    : "保存期間内の成果はありません。"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {filtered
                    ? nextCursor
                      ? "まだ続きがあります。続きを取得するか、検索条件を変えて探せます。"
                      : "名前やIDを短くするか、絞り込み条件を解除して探してみてください。"
                    : "ルームでの共有内容が保存されると、ここに表示されます。"}
                </p>
                {filtered && onSearch && (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => onSearch(DEFAULT_OUTCOME_FILTERS)}
                  >
                    条件をクリア
                  </Button>
                )}
              </div>
            )}
            {paginationError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-card p-4"
              >
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={onRetry ?? onMore}
                >
                  再試行
                </Button>
              </div>
            )}
            {nextCursor && !paginationError && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  className="min-h-11 px-6"
                  disabled={busy}
                  onClick={onMore}
                >
                  {loadingMore ? "次の成果を取得中…" : "次の成果を表示"}
                  {!loadingMore && <ChevronRight aria-hidden />}
                </Button>
              </div>
            )}
            {!nextCursor && outcomes.length > 0 && (
              <p className="text-center text-xs text-muted-foreground">
                {filtered
                  ? "条件に一致する成果をすべて表示しています。"
                  : "保存期間内の成果をすべて表示しています。"}
              </p>
            )}
          </section>
        )}
        {!loading && !error && detail && (
          <>
            <section className="rounded-xl border bg-card p-5">
              <p className="font-mono text-sm">{detail.displayId}</p>
              <OutcomeMetadata outcome={detail} />
              <p className="mt-3 text-xs text-muted-foreground">
                閲覧期限：{formatOutcomeTime(detail.expiresAt)}
              </p>
            </section>
            {detail.saveStatus !== "saved" && (
              <p
                role="status"
                className="rounded-xl border border-amber-500/40 bg-amber-50 p-5 text-amber-950"
              >
                {detail.saveStatus === "failed"
                  ? "保存に失敗しました。"
                  : "成果一覧への反映を待っています。"}
                {detail.snapshot
                  ? "表示している内容は前回の正常保存分です。"
                  : "正常保存分はまだありません。"}
                サーバーが自動で再試行します。
              </p>
            )}
            {!detail.snapshot ? (
              <p className="rounded-xl border bg-card p-8">
                正常保存された成果はまだありません。
              </p>
            ) : (
              <>
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">決定した3項目</h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    {PHASE_LABELS.map((label, index) => {
                      const decision = detail.snapshot?.decisions.find(
                        (item) => item.phase === index + 1,
                      );
                      return (
                        <article
                          key={label}
                          className="rounded-xl border bg-card p-5"
                        >
                          <h3 className="text-sm font-semibold text-muted-foreground">
                            {label}
                          </h3>
                          <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">
                            {decision?.content || "未決定"}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">
                    {detail.status === "confirmed" &&
                    detail.saveStatus === "saved"
                      ? "完了時点の共有ボード"
                      : "最後に正常保存した共有ボード"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    記録時点：{formatOutcomeTime(detail.snapshot.capturedAt)} ·{" "}
                    {getRoomPhaseLabel(detail.snapshot.phase)}
                  </p>
                  {detail.snapshot.notes.length === 0 && (
                    <p className="rounded-xl border bg-card p-8">
                      保存済みの成果はありません。
                    </p>
                  )}
                  <Tabs defaultValue="1">
                    <TabsList aria-label="共有ボードの種類">
                      {PHASE_LABELS.map((label, index) => (
                        <TabsTrigger
                          key={label}
                          value={String(index + 1)}
                          className="min-h-11"
                        >
                          {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {PHASE_LABELS.map((label, index) => (
                      <TabsContent key={label} value={String(index + 1)}>
                        <SharedOutcomeBoard
                          key={label}
                          label={label}
                          phase={index + 1}
                          snapshot={
                            detail.snapshot as NonNullable<
                              SharedOutcomeRecord["snapshot"]
                            >
                          }
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                </section>
              </>
            )}
            {history && (
              <div ref={historyRef}>
                <ProgressHistoryView {...history} />
              </div>
            )}
          </>
        )}
        <footer className="space-y-2 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            権限を持つログインユーザーの閲覧専用
          </p>
          <p>
            途中の成果は最後の利用から30日、確定した成果は初回の成果公開から30日間保存されます。閲覧しても保存期間は延長されません。
          </p>
        </footer>
      </div>
    </main>
  );
}
function OutcomeMetadata({ outcome }: { outcome: SharedOutcomeSummary }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
      <div className="min-w-0 space-y-1">
        <dt className="text-muted-foreground">到達点</dt>
        <dd className="break-words">{getRoomPhaseLabel(outcome.phase)}</dd>
      </div>
      <div className="min-w-0 space-y-1">
        <dt className="text-muted-foreground">記録</dt>
        <dd>
          {outcome.status === "confirmed" ? "確定" : "途中"} ·{" "}
          {SAVE_STATUS_LABELS[outcome.saveStatus]}
        </dd>
      </div>
      <div className="min-w-0 space-y-1">
        <dt className="text-muted-foreground">最終利用</dt>
        <dd className="tabular-nums">
          {formatOutcomeTime(outcome.lastUsedAt)}
        </dd>
      </div>
      <div className="min-w-0 space-y-1">
        <dt className="text-muted-foreground">最後の保存</dt>
        <dd className="tabular-nums">
          {outcome.lastSavedAt === null
            ? "保存なし"
            : formatOutcomeTime(outcome.lastSavedAt)}
        </dd>
      </div>
    </dl>
  );
}
