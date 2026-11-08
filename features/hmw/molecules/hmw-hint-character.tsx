"use client";

import { RefreshCw, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";
import { buildHmwHintQuestion, HMW_HINT_GROUPS } from "../logic/hmw-hints";

export type HmwHintCharacterProps = {
  decidedIssue: string | null;
  onUseQuestion: (question: string) => void;
  disabled?: boolean;
  pending?: boolean;
  showNudge?: boolean;
  onHintOpen?: () => void;
  onDismissNudge?: () => void;
};

export function HmwHintCharacter({
  decidedIssue,
  onUseQuestion,
  disabled = false,
  pending = false,
  showNudge = false,
  onHintOpen,
  onDismissNudge,
}: HmwHintCharacterProps) {
  const titleId = useId();
  const questionId = useId();
  const [open, setOpen] = useState(false);
  const [groupIndex, setGroupIndex] = useState(0);
  const [selection, setSelection] = useState<{
    issue: string | null;
    id: string;
    question: string;
  } | null>(null);
  const queuedQuestion = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const question = selection?.issue === decidedIssue ? selection.question : "";
  const tooLong = question.length > NOTE_CONTENT_MAX_LENGTH;
  const hasIssue = Boolean(decidedIssue?.trim());
  useEffect(
    () => () => {
      queuedQuestion.current = null;
    },
    [],
  );

  return (
    <div className="relative" data-testid="hmw-hint-character">
      {showNudge && !open ? (
        <div
          role="status"
          className="absolute bottom-full left-0 mb-2 flex w-48 items-start gap-1 rounded-xl border bg-background p-3 text-sm shadow-tool"
        >
          <span>こんな見方もあるかも…</span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0"
            aria-label="呼びかけを閉じる"
            onClick={onDismissNudge}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setSubmitting(false);
            onHintOpen?.();
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={submitting}
            aria-label="問いのヒントを開く"
            className="pointer-events-auto flex flex-col items-center rounded-xl p-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/landing/mood-g.webp"
              alt=""
              width={80}
              height={77}
              className="h-16 w-16 object-contain"
              draggable={false}
            />
            <span>ヒント</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          collisionPadding={12}
          aria-labelledby={titleId}
          className="max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto p-4 motion-reduce:animate-none"
          onCloseAutoFocus={(event) => {
            const text = queuedQuestion.current;
            if (text === null) return;
            event.preventDefault();
            queuedQuestion.current = null;
            setSubmitting(false);
            // 吹き出しを閉じた後に追加し、本人の明示操作として新規本文へfocusする。
            onUseQuestion(text);
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-base font-bold">
              問いのヒント
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="問いのヒントを閉じる"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          {hasIssue ? (
            <div className="mt-3 space-y-4">
              <p className="text-sm text-muted-foreground">
                気になる言葉を選んでみよう。
              </p>
              <fieldset
                aria-label="考え方のワード"
                className="grid grid-cols-3 gap-2"
              >
                {HMW_HINT_GROUPS[groupIndex].map((hint) => (
                  <Button
                    key={hint.id}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 whitespace-normal break-words px-2 py-2 text-sm"
                    aria-pressed={
                      selection?.issue === decidedIssue &&
                      selection.id === hint.id
                    }
                    onClick={() => {
                      const text = buildHmwHintQuestion(decidedIssue, hint);
                      if (text)
                        setSelection({
                          issue: decidedIssue,
                          id: hint.id,
                          question: text,
                        });
                    }}
                  >
                    {hint.word}
                  </Button>
                ))}
              </fieldset>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setGroupIndex(
                    (index) => (index + 1) % HMW_HINT_GROUPS.length,
                  );
                  setSelection(null);
                }}
              >
                <RefreshCw aria-hidden="true" />
                別の3つ
              </Button>
              {question || selection?.issue === decidedIssue ? (
                <div className="space-y-3">
                  <p className="text-sm">例えば、こんな問いはどうかな？</p>
                  <label htmlFor={questionId} className="sr-only">
                    問いの文例
                  </label>
                  <textarea
                    id={questionId}
                    value={question}
                    rows={4}
                    className="block min-h-28 w-full resize-y rounded-md border bg-background p-3 text-base leading-7 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-invalid={tooLong || undefined}
                    onChange={(event) =>
                      setSelection(
                        (current) =>
                          current && {
                            ...current,
                            question: event.target.value,
                          },
                      )
                    }
                  />
                  {tooLong ? (
                    <p role="alert" className="text-sm text-destructive">
                      文例を{NOTE_CONTENT_MAX_LENGTH}
                      文字以内に短くすると使えます。
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    className="w-full"
                    disabled={
                      disabled ||
                      pending ||
                      submitting ||
                      !question.trim() ||
                      tooLong
                    }
                    onClick={() => {
                      if (submitting) return;
                      queuedQuestion.current = question.trim();
                      setSubmitting(true);
                      setOpen(false);
                    }}
                  >
                    この問いを使う
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              決定した課題を確認できません。接続後にもう一度確認してください。
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
