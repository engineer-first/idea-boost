"use client";
import { ArrowLeft, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoomPhaseLabel } from "@/contracts/phase";
import type {
  SharedOutcomeRecord,
  SharedOutcomeSummary,
} from "@/contracts/shared-outcomes";
import { SharedOutcomeBoard } from "./shared-outcome-board";
import {
  formatOutcomeTime,
  PHASE_LABELS,
  SAVE_STATUS_LABELS,
} from "./shared-outcomes-content";
export type SharedOutcomesViewProps = {
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
  return (
    <main className="flex-1 overflow-y-auto bg-muted/30 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden />
              秘密リンクによる閲覧専用
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {detail
                ? detail.name || `ルーム #${detail.displayId}`
                : "共有成果"}
            </h1>
            <p className="text-sm text-muted-foreground">
              すべてのルームの共有成果 · 最後の利用から30日間保存
            </p>
          </div>
          <Button
            variant="outline"
            disabled={loading}
            onClick={onRefresh}
            className="min-h-11"
          >
            <RefreshCw aria-hidden />
            最新の状態を取得
          </Button>
        </header>
        {detail && (
          <Button
            variant="ghost"
            onClick={onBack}
            disabled={loading}
            className="min-h-11"
          >
            <ArrowLeft aria-hidden />
            成果一覧へ戻る
          </Button>
        )}
        {loading && (
          <p role="status" className="rounded-xl border bg-card p-8">
            成果を読み込んでいます…
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-card p-6 text-destructive"
          >
            {error}
            <Button
              variant="outline"
              className="ml-3 min-h-11"
              onClick={onBack}
            >
              一覧を再取得
            </Button>
          </div>
        )}
        {!loading && !error && !detail && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {outcomes.map((outcome) => (
                <button
                  key={outcome.roomId}
                  type="button"
                  onClick={() => onOpen(outcome.roomId)}
                  className="group cursor-pointer rounded-xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="break-words text-lg font-semibold">
                        {outcome.name || `ルーム #${outcome.displayId}`}
                      </h2>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {outcome.displayId}
                      </p>
                    </div>
                    <ArrowRight className="size-5 shrink-0" aria-hidden />
                  </div>
                  <OutcomeMetadata outcome={outcome} />
                  {outcome.saveStatus !== "saved" && (
                    <p className="mt-3 text-sm text-amber-800">
                      {outcome.lastSavedAt
                        ? "前回の正常保存分を表示します。サーバーが自動で再試行します。"
                        : "正常保存分はまだありません。サーバーが自動で再試行します。"}
                    </p>
                  )}
                  <p className="mt-4 text-sm font-semibold text-primary">
                    成果を見る
                  </p>
                </button>
              ))}
            </div>
            {outcomes.length === 0 && (
              <p className="rounded-xl border bg-card p-8 text-muted-foreground">
                保存期間内の成果はありません。
              </p>
            )}
            {nextCursor && (
              <Button variant="outline" onClick={onMore}>
                次の成果を表示
              </Button>
            )}
          </>
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
          </>
        )}
      </div>
    </main>
  );
}
function OutcomeMetadata({ outcome }: { outcome: SharedOutcomeSummary }) {
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">到達点</dt>
      <dd>{getRoomPhaseLabel(outcome.phase)}</dd>
      <dt className="text-muted-foreground">記録</dt>
      <dd>
        {outcome.status === "confirmed" ? "確定" : "途中"} ·{" "}
        {SAVE_STATUS_LABELS[outcome.saveStatus]}
      </dd>
      <dt className="text-muted-foreground">最終利用</dt>
      <dd>{formatOutcomeTime(outcome.lastUsedAt)}</dd>
      <dt className="text-muted-foreground">最後の保存</dt>
      <dd>
        {outcome.lastSavedAt === null
          ? "保存なし"
          : formatOutcomeTime(outcome.lastSavedAt)}
      </dd>
    </dl>
  );
}
