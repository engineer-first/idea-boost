"use client";
import { Angry, Check, Frown, Laugh, Meh, Smile, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  FEEDBACK_BODY_LIMIT,
  FEEDBACK_KINDS,
  FEEDBACK_TARGETS,
  type FeedbackKind,
} from "@/contracts/feedback";
import { FEEDBACK_NOTICE, RATINGS } from "./feedback-content";
import type { FeedbackControls } from "./use-feedback";

const FACES = [Angry, Frown, Meh, Smile, Laugh];
export function FeedbackPanel({ feedback }: { feedback: FeedbackControls }) {
  const id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    composing = useRef(false);
  useEffect(() => {
    if (feedback.isOpen) heading.current?.focus();
    else composing.current = false;
  }, [feedback.isOpen]);
  if (!feedback.isOpen) return null;
  const { draft, pending, error, receipt } = feedback;
  return (
    <section
      role="dialog"
      aria-labelledby={`${id}-heading`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (composing.current || event.nativeEvent.isComposing) return;
          feedback.close();
        }
      }}
      className="fixed bottom-3 left-3 z-[80] max-h-[calc(100dvh-1.5rem)] w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border bg-background p-4 shadow-xl sm:bottom-5 sm:left-5 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          ref={heading}
          tabIndex={-1}
          id={`${id}-heading`}
          className="text-lg font-semibold outline-none"
        >
          フィードバック
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={feedback.receipt ? "受領画面を閉じる" : "入力欄を閉じる"}
          onClick={feedback.close}
        >
          <X className="size-4" />
        </Button>
      </div>
      {receipt ? (
        <div className="space-y-3 py-4">
          <p role="status" className="flex items-center gap-2 font-medium">
            <Check className="size-5" />
            意見を受け付けました。ありがとうございます。
          </p>
          <p className="break-all text-xs text-muted-foreground">
            受付ID：{receipt}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={feedback.close}>作業に戻る</Button>
            <Button
              variant="outline"
              onClick={() => {
                feedback.open("app");
                heading.current?.focus();
              }}
            >
              別のフィードバック
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-3 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (composing.current) return;
            // 送信ボタンが消えても位置を保つ。非同期完了時には移動しない。
            heading.current?.focus();
            void feedback.send();
          }}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            <label
              htmlFor={`${id}-target`}
              className="block text-sm font-medium"
            >
              対象
              <select
                id={`${id}-target`}
                aria-label="対象"
                value={draft.target}
                onChange={(event) =>
                  feedback.change({ target: event.target.value })
                }
                className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2 text-sm"
              >
                {FEEDBACK_TARGETS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                種類（必須・1つ選択）
              </legend>
              <p className="mb-2 text-xs text-muted-foreground">
                種類を選ぶだけでも送れます。
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FEEDBACK_KINDS).map(([value, label]) => (
                  <label key={value} className="cursor-pointer">
                    <input
                      type="radio"
                      className="peer sr-only"
                      name={`${id}-kind`}
                      value={value}
                      checked={draft.kind === value}
                      onChange={() =>
                        feedback.change({ kind: value as FeedbackKind })
                      }
                    />
                    <span className="flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm peer-checked:border-foreground peer-checked:bg-muted peer-checked:font-bold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                      {draft.kind === value ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : null}
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label htmlFor={`${id}-body`} className="block text-sm font-medium">
              文章（任意）
              <textarea
                id={`${id}-body`}
                aria-label="文章（任意）"
                maxLength={FEEDBACK_BODY_LIMIT}
                value={draft.body}
                onChange={(event) =>
                  feedback.change({ body: event.target.value })
                }
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={(event) => {
                  composing.current = false;
                  feedback.change({ body: event.currentTarget.value });
                }}
                rows={3}
                className="mt-1 block w-full resize-y rounded-md border bg-background p-2 font-normal"
              />
              <span className="block text-right text-xs font-normal text-muted-foreground">
                {draft.body.length} / {FEEDBACK_BODY_LIMIT}
              </span>
            </label>
            {draft.target === "app" ? (
              <fieldset>
                <legend className="text-sm font-medium">
                  使いやすさ（任意）
                </legend>
                <p className="mb-2 mt-1 text-xs text-muted-foreground">
                  Idea Boost は使いやすかったですか？
                </p>
                <div className="grid grid-cols-5 gap-1">
                  {RATINGS.map(({ value, label }, index) => {
                    const Face = FACES[index];
                    return (
                      <label key={value} className="min-w-0 cursor-pointer">
                        <input
                          type="radio"
                          className="peer sr-only"
                          name={`${id}-rating`}
                          aria-label={`${value} ${label}`}
                          value={value}
                          checked={draft.rating === value}
                          onChange={() => feedback.change({ rating: value })}
                        />
                        <span className="flex h-full flex-col items-center gap-1 rounded-lg border px-1 py-3 text-center peer-checked:border-foreground peer-checked:bg-muted peer-checked:font-bold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                          <Face aria-hidden="true" className="size-6" />
                          <span className="flex items-center text-sm">
                            {value}
                            {draft.rating === value ? (
                              <Check aria-hidden="true" className="size-3" />
                            ) : null}
                          </span>
                          <span className="text-xs leading-4">{label}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => feedback.change({ rating: null })}
                  className="mt-1 min-h-9 text-xs underline"
                >
                  {draft.rating === null
                    ? "未回答のまま送れます"
                    : "評価を未回答に戻す"}
                </button>
              </fieldset>
            ) : null}
          </fieldset>
          <p className="text-xs leading-5 text-muted-foreground">
            {FEEDBACK_NOTICE}{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              保存とプライバシー（別タブ）
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            閉じても入力は残ります。再読込やルーム外への移動で未送信の入力は消えます。
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={pending || !draft.kind}
            className="w-full"
          >
            {pending
              ? "送信中…"
              : feedback.retryWithNewId
                ? "新しい意見として送信"
                : "送信"}
          </Button>
        </form>
      )}
    </section>
  );
}
