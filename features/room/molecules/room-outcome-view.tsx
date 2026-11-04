"use client";

import Link from "next/link";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getNoteHeight, NOTE_DEFAULT_FONT_SIZE } from "@/contracts/board";
import { StickyNote } from "@/features/notes";
import { formatOutcomeText, type RoomOutcome } from "../logic/outcome-text";

export type RoomOutcomeViewProps = {
  outcome: RoomOutcome | null;
  connected?: boolean;
  authorized?: boolean;
  children?: ReactNode;
  additionalNavigation?: ReactNode;
  recordInfo?: ReactNode;
  footer?: ReactNode;
  onBackToBoard?: () => void;
  onOpenFeedback?: () => void;
  feedbackButtonRef?: Ref<HTMLButtonElement>;
  onExportSuccess?: () => void;
  onExportFailure?: () => void;
  feedbackPrompt?: ReactNode;
};

const CARDS = [
  { number: "1", label: "決定した課題", key: "issue" },
  { number: "2", label: "決定した問い", key: "hmw" },
  { number: "3", label: "採用したアイデア", key: "idea" },
] as const;

export function RoomOutcomeView({
  outcome,
  connected = false,
  authorized,
  children,
  additionalNavigation,
  recordInfo,
  onBackToBoard,
  onOpenFeedback,
  feedbackButtonRef,
  footer,
  onExportSuccess,
  onExportFailure,
  feedbackPrompt,
}: RoomOutcomeViewProps) {
  const [copyFailed, setCopyFailed] = useState(false);
  const [copySucceeded, setCopySucceeded] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [copyPending, setCopyPending] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const active = useRef(true);
  const exportGeneration = useRef(0);
  const available = authorized ?? connected;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onExportFailure?.();
    };
  }, [onExportFailure]);
  useEffect(() => {
    if (!available || !outcome) {
      exportGeneration.current++;
      setCopyPending(false);
      setCopySucceeded(false);
      setCopyFailed(false);
      setDownloadStarted(false);
      setSaveFailed(false);
      onExportFailure?.();
    }
  }, [available, outcome, onExportFailure]);
  const canExport = available && outcome !== null;
  const outputText = outcome ? formatOutcomeText(outcome, new Date()) : "";

  function saveText() {
    if (!canExport || copyPending) return;
    setCopySucceeded(false);
    setCopyFailed(false);
    let url: string | undefined;
    const anchor = document.createElement("a");
    try {
      const now = new Date();
      const blob = new Blob([`\uFEFF${formatOutcomeText(outcome, now)}`], {
        type: "text/plain;charset=utf-8",
      });
      url = URL.createObjectURL(blob);
      anchor.href = url;
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      anchor.download = `idea-boost-outcome-${localDate}.txt`;
      document.body.append(anchor);
      anchor.click();
      setDownloadStarted(true);
      setSaveFailed(false);
      setCopySucceeded(false);
      setCopyFailed(false);
      onExportSuccess?.();
    } catch {
      setDownloadStarted(false);
      setSaveFailed(true);
      onExportFailure?.();
    } finally {
      anchor.remove();
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
    }
  }

  async function copyText() {
    if (!canExport || copyPending) return;
    const generation = exportGeneration.current;
    setCopyPending(true);
    if (copySucceeded || downloadStarted) onExportFailure?.();
    setCopySucceeded(false);
    setCopyFailed(false);
    setSaveFailed(false);
    setDownloadStarted(false);
    try {
      await navigator.clipboard.writeText(
        formatOutcomeText(outcome, new Date()),
      );
      if (!active.current || generation !== exportGeneration.current) return;
      setCopySucceeded(true);
      setCopyFailed(false);
      onExportSuccess?.();
    } catch {
      if (!active.current || generation !== exportGeneration.current) return;
      onExportFailure?.();
      setCopySucceeded(false);
      setCopyFailed(true);
    } finally {
      if (active.current && generation === exportGeneration.current)
        setCopyPending(false);
    }
  }

  return (
    <main
      className="h-full min-h-0 overflow-y-auto bg-background px-4 py-8 text-foreground sm:px-8 sm:py-12"
      data-testid="room-outcome-view"
    >
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          チームで決めた成果
        </h1>
        <p className="mt-3 text-balance text-base leading-6 text-muted-foreground">
          決めた内容を持ち帰り、次の制作に使いましょう。
        </p>
        <hr className="mt-6 border-border" />

        <ol
          aria-label="成果の流れ"
          className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-medium text-muted-foreground"
        >
          <li>01 課題</li>
          <li aria-hidden="true">→</li>
          <li>02 問い</li>
          <li aria-hidden="true">→</li>
          <li>03 アイデア</li>
        </ol>
        {!available || !outcome ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-border bg-muted px-4 py-3 text-base leading-6"
          >
            {authorized === false
              ? "閲覧権限を確認できません。ホームの「過去の成果を見る」から開き直してください。"
              : !available
                ? "接続が切れています。前回受信した内容は最新か確認できません。再接続してから成果を確認・保存してください。"
                : "決定内容をすべて確認できません。再接続してから成果を確認・保存してください。"}
          </p>
        ) : null}

        <div className="mt-6 flex flex-row flex-wrap justify-center gap-4">
          {CARDS.map(({ number, label, key }) => {
            const content = outcome?.[key] ?? "確認できません";
            const noteText = `${number}. ${label}\n${content}`;

            return (
              <StickyNote
                key={key}
                noteId={`outcome-${key}`}
                color="yellow"
                height={getNoteHeight(noteText, NOTE_DEFAULT_FONT_SIZE)}
                className="relative w-[200px]"
              >
                <div className="flex h-full flex-col p-2">
                  <p className="min-h-0 min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-base leading-6 select-text">
                    <span className="font-bold">
                      {number}. {label}
                    </span>
                    {"\n"}
                    {!available ? (
                      <>
                        <span className="text-xs font-medium">未確認</span>
                        {"\n"}
                      </>
                    ) : null}
                    {content}
                  </p>
                </div>
              </StickyNote>
            );
          })}
        </div>
        {canExport ? (
          <section className="mt-8 border-t border-border pt-4">
            <h2 className="text-lg font-bold">成果を保存する</h2>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button className="min-h-11" type="button" disabled>
                PNGで保存
              </Button>

              <Button
                className="min-h-11"
                type="button"
                variant="outline"
                onClick={saveText}
                disabled={copyPending}
              >
                テキストを保存
              </Button>

              <Button
                className="min-h-11"
                type="button"
                variant="outline"
                onClick={() => void copyText()}
                disabled={copyPending}
              >
                {copyPending ? "コピー中…" : "全文をコピー"}
              </Button>
            </div>
          </section>
        ) : null}
        {downloadStarted && canExport ? (
          <p role="status" className="mt-3 text-base">
            ダウンロードを開始しました。保存したファイルを確認してください。
          </p>
        ) : null}
        {copySucceeded && canExport ? (
          <p role="status" className="mt-3 text-base">
            コピーしました。メモに貼り付けて保存してください。
          </p>
        ) : null}
        {saveFailed && canExport ? (
          <p role="alert" className="mt-3 text-base text-destructive">
            保存を開始できませんでした。もう一度試すか、全文をコピーしてください。
          </p>
        ) : null}
        {copyFailed && canExport ? (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-white p-4">
            <p role="alert" className="text-base">
              コピーできませんでした。下の全文を選択して手動でコピーしてください。
            </p>
            <textarea
              readOnly
              aria-label="手動でコピーする成果全文"
              className="mt-3 h-56 w-full rounded-md border p-3 text-base"
              value={outputText}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        ) : null}
        {feedbackPrompt}
        {children}
        <section className="mt-8 rounded-lg border border-border bg-card p-4 sm:p-6">
          <h2 className="text-lg font-bold">次に試すこと</h2>
          <p className="mt-2 text-base leading-7">
            誰の、どんな場面を確かめたい？
            簡単な画面を描き、その人に見せて確かめてみよう。
          </p>
        </section>
        {recordInfo}

        <nav
          aria-label="ページ移動"
          className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 pb-8"
        >
          {onBackToBoard && (
            <Button type="button" variant="outline" onClick={onBackToBoard}>
              ボードへ戻る
            </Button>
          )}

          <Link
            href="/home"
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-base font-semibold text-primary underline underline-offset-4 hover:no-underline"
          >
            ホームへ戻る
          </Link>

          {additionalNavigation}
        </nav>

        {!authorized ? (
          <p className="text-xs leading-5 text-muted-foreground">
            完了したルームは、ホームの「過去の成果を見る」から見返せます。
            保存期限は完了から30日間です。
          </p>
        ) : null}

        {footer || onOpenFeedback ? (
          <footer className="mt-6 border-t border-border pt-4 pb-8">
            {footer}

            {onOpenFeedback ? (
              <div className={footer ? "mt-3" : ""}>
                <Button
                  ref={feedbackButtonRef}
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-sm text-muted-foreground"
                  onClick={onOpenFeedback}
                >
                  フィードバック
                </Button>
              </div>
            ) : null}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
