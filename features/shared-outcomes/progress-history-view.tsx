"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoomPhaseLabel } from "@/contracts/phase";
import type {
  ProgressHistoryEntry,
  ProgressHistoryRecord,
} from "@/contracts/shared-outcomes";
import {
  formatHistoryDuration,
  formatHistoryTime,
  HISTORY_ACTION_LABELS,
  HISTORY_STATUS_EXPLANATIONS,
  HISTORY_STATUS_LABELS,
} from "./progress-history-content";
import { SharedOutcomeBoard } from "./shared-outcome-board";
import { PHASE_LABELS } from "./shared-outcomes-content";
export type ProgressHistoryViewProps = {
  entries: ProgressHistoryEntry[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  selected: ProgressHistoryEntry | null;
  record: ProgressHistoryRecord | null;
  recordLoading: boolean;
  recordError: string | null;
  onOpen: (entry: ProgressHistoryEntry) => void;
  onMore: () => void;
  onRefresh: () => void;
  onRetry: () => void;
};
export function ProgressHistoryView(props: ProgressHistoryViewProps) {
  const {
    entries,
    nextCursor,
    loading,
    error,
    selected,
    record,
    recordLoading,
    recordError,
    onOpen,
    onMore,
    onRefresh,
    onRetry,
  } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousSelection = useRef(selected?.id);
  useEffect(() => {
    if (selected?.id && previousSelection.current !== selected.id) {
      headingRef.current?.focus();
      headingRef.current?.scrollIntoView?.({ block: "start" });
    }
    previousSelection.current = selected?.id;
  }, [selected?.id]);
  const snapshot = record?.snapshot;
  return (
    <section className="space-y-4" aria-label="進行の記録">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">進行の記録</h2>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={loading || recordLoading}
          onClick={onRefresh}
        >
          記録の最新状態を取得
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        訪問した順に表示します。時間差には休憩・会話・切断中も含まれます。操作上の迷いや不具合を示すものではありません。時刻は日本時間です。
      </p>
      {loading && <p role="status">進行の記録を読み込んでいます…</p>}
      {error && (
        <div role="alert" className="rounded-xl border p-4">
          {error}
          <Button
            variant="outline"
            className="m-2 min-h-11"
            onClick={onRefresh}
          >
            記録を再取得
          </Button>
        </div>
      )}
      {!loading && !error && !entries.length && (
        <p className="rounded-xl border bg-card p-6">
          節目の記録はまだありません。導入前の履歴は復元しません。
        </p>
      )}
      <ol className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="font-semibold">
                {entry.sequence}. {getRoomPhaseLabel(entry.phase)}
              </h3>
              <span className="rounded border px-2 py-1 text-sm">
                {HISTORY_STATUS_LABELS[entry.saveStatus]}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {entry.action ? HISTORY_ACTION_LABELS[entry.action] : "進行中"} →{" "}
              {entry.action === "complete"
                ? "成果公開"
                : entry.nextPhase
                  ? getRoomPhaseLabel(entry.nextPhase)
                  : "終了未記録"}
            </p>
            <dl className="my-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">開始</dt>
                <dd>
                  {entry.enteredAt === null
                    ? "開始時刻不明"
                    : formatHistoryTime(entry.enteredAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">終了</dt>
                <dd>
                  {entry.exitedAt === null
                    ? "終了未記録"
                    : formatHistoryTime(entry.exitedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">時間差</dt>
                <dd>{formatHistoryDuration(entry)}</dd>
              </div>
            </dl>
            {entry.saveStatus !== "open" && (
              <Button
                variant={selected?.id === entry.id ? "default" : "outline"}
                className="min-h-11"
                aria-label={`記録 ${entry.sequence} の盤面を見る`}
                aria-pressed={selected?.id === entry.id}
                onClick={() => onOpen(entry)}
              >
                盤面を見る
              </Button>
            )}
          </li>
        ))}
      </ol>
      {nextCursor && (
        <Button
          variant="outline"
          className="min-h-11"
          disabled={loading}
          onClick={onMore}
        >
          次の記録を表示
        </Button>
      )}
      {selected && (
        <section
          aria-label="選択した記録"
          aria-busy={recordLoading}
          className="space-y-4 rounded-xl border-2 border-primary/30 bg-card p-4 sm:p-6"
        >
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-4 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            記録 {selected.sequence} · {getRoomPhaseLabel(selected.phase)}
          </h3>
          <p className="text-sm">
            移行先：
            {selected.action === "complete"
              ? "成果公開"
              : selected.nextPhase
                ? getRoomPhaseLabel(selected.nextPhase)
                : "終了未記録"}
          </p>
          <p className="text-sm">
            記録時刻：
            {selected.exitedAt === null
              ? "終了未記録"
              : formatHistoryTime(selected.exitedAt)}{" "}
            · {HISTORY_STATUS_LABELS[selected.saveStatus]}
          </p>
          <p className="text-sm text-muted-foreground">
            閲覧への反映：
            {selected.reflectedAt === null
              ? "未反映"
              : formatHistoryTime(selected.reflectedAt)}
          </p>
          {recordLoading ? (
            <p role="status">盤面を読み込んでいます…</p>
          ) : recordError ? (
            <div role="alert">
              {recordError}
              <Button
                variant="outline"
                className="m-2 min-h-11"
                onClick={onRetry}
              >
                盤面を再取得
              </Button>
            </div>
          ) : snapshot ? (
            <>
              {!snapshot.notes.length && <p>正常に保存された空の盤面です。</p>}
              <div className="space-y-3">
                <h4 className="font-semibold">この時点の決定内容</h4>
                <dl className="grid gap-3 sm:grid-cols-3">
                  {PHASE_LABELS.map((label, index) => (
                    <div key={label} className="rounded-lg border p-3">
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {snapshot.decisions.find(
                          (decision) => decision.phase === index + 1,
                        )?.content || "未決定"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <Tabs
                key={selected.id}
                defaultValue={String(
                  selected.phase.kind === "step" ? selected.phase.phase : 1,
                )}
              >
                <TabsList aria-label="記録のボードの種類">
                  {PHASE_LABELS.map((label, index) => (
                    <TabsTrigger
                      className="min-h-11"
                      key={label}
                      value={String(index + 1)}
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {PHASE_LABELS.map((label, index) => (
                  <TabsContent key={label} value={String(index + 1)}>
                    <SharedOutcomeBoard
                      label={label}
                      phase={index + 1}
                      snapshot={snapshot}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </>
          ) : (
            record && (
              <p role="status">
                {HISTORY_STATUS_EXPLANATIONS[record.saveStatus]}
              </p>
            )
          )}
        </section>
      )}
    </section>
  );
}
