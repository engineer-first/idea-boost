"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RoomOutcome } from "../logic/outcome-text";
import { formatOutcomeText } from "../logic/outcome-text";

export type RoomOutcomeViewProps = {
  outcome: RoomOutcome | null;
  connected: boolean;
  onBackToBoard: () => void;
};

const CARDS = [
  { number: "1", label: "決定した課題", key: "issue" },
  { number: "2", label: "決定した問い（HMW）", key: "hmw" },
  { number: "3", label: "採用したアイデア", key: "idea" },
] as const;

export function RoomOutcomeView({
  outcome,
  connected,
  onBackToBoard,
}: RoomOutcomeViewProps) {
  const [copyFailed, setCopyFailed] = useState(false);
  const [copySucceeded, setCopySucceeded] = useState(false);
  const canExport = connected && outcome !== null;
  const outputText = outcome ? formatOutcomeText(outcome, new Date()) : "";

  function saveText() {
    if (!canExport) return;
    const blob = new Blob([`\uFEFF${formatOutcomeText(outcome, new Date())}`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `idea-boost-outcome-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function copyText() {
    if (!canExport) return;
    try {
      await navigator.clipboard.writeText(
        formatOutcomeText(outcome, new Date()),
      );
      setCopySucceeded(true);
      setCopyFailed(false);
    } catch {
      setCopySucceeded(false);
      setCopyFailed(true);
    }
  }

  return (
    <main
      className="h-full min-h-0 overflow-y-auto bg-[#f8f5e9] px-4 py-8 text-foreground sm:px-8 sm:py-12"
      data-testid="room-outcome-view"
    >
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm font-semibold tracking-wide text-amber-900">
          SPRINT OUTCOME
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          チームで決めた成果
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          決めた内容を持ち帰り、次の制作に使いましょう。
        </p>
        {!connected || !outcome ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-amber-700/30 bg-white px-4 py-3 text-sm leading-6"
          >
            {!connected
              ? "接続が切れています。前回受信した内容は最新か確認できません。再接続してから成果を確認・保存してください。"
              : "決定内容をすべて確認できません。再接続してから成果を確認・保存してください。"}
          </p>
        ) : null}
        <div className="mt-8 grid gap-4">
          {CARDS.map(({ number, label, key }) => (
            <section
              key={key}
              className="min-w-0 rounded-md border border-amber-300/80 bg-[#fff4b8] px-5 py-5 shadow-[2px_4px_12px_rgba(83,60,0,0.12)] sm:px-7"
            >
              <h2 className="flex items-center gap-3 text-base font-bold text-amber-950">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-900 text-sm text-white"
                >
                  {number}
                </span>
                {label}
                {!connected ? (
                  <span className="ml-auto text-xs font-medium text-amber-900">
                    未確認
                  </span>
                ) : null}
              </h2>
              <p className="mt-4 min-w-0 whitespace-pre-wrap text-base leading-8 [overflow-wrap:anywhere] select-text">
                {outcome?.[key] ?? "確認できません"}
              </p>
            </section>
          ))}
        </div>
        {canExport ? (
          <div className="mt-8 flex flex-wrap gap-3">
            <Button type="button" onClick={saveText}>
              テキストを保存
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyText()}
            >
              全文をコピー
            </Button>
          </div>
        ) : null}
        {canExport ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            保存したファイルを開いて内容を確認してください。コピーしたらメモに貼り付けて保存してください。
          </p>
        ) : null}
        {copySucceeded && canExport ? (
          <p role="status" className="mt-3 text-sm">
            コピーしました。メモに貼り付けて保存してください。
          </p>
        ) : null}
        {copyFailed && canExport ? (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-white p-4">
            <p role="alert" className="text-sm">
              コピーできませんでした。下の全文を選択して手動でコピーしてください。
            </p>
            <textarea
              readOnly
              aria-label="手動でコピーする成果全文"
              className="mt-3 h-56 w-full rounded-md border p-3 text-sm"
              value={outputText}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        ) : null}
        <section className="mt-10 rounded-xl border border-amber-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold">次に試すこと</h2>
          <p className="mt-2 text-sm leading-7">
            誰の、どんな場面を確かめたい？
            簡単な画面を描き、その人に見せて確かめてみよう。
          </p>
        </section>
        <div className="mt-8 flex flex-wrap items-center gap-4 pb-8">
          <Button type="button" variant="outline" onClick={onBackToBoard}>
            ボードへ戻る
          </Button>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold underline-offset-4 hover:underline"
          >
            保存を確認してホームへ
          </Link>
        </div>
        <p className="pb-8 text-xs leading-5 text-muted-foreground">
          ホームへ戻ってもルームは残ります。同じログイン状態なら招待URLから再び確認できます。
        </p>
      </div>
    </main>
  );
}
