"use client";

import { ArrowRight, PencilLine, RefreshCw, X } from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";
import { buildHmwHintQuestion, HMW_HINT_GROUPS } from "../logic/hmw-hints";
import styles from "./hmw-hint-character.module.css";

export type HmwHintCharacterProps = {
  decidedIssue: string | null;
  onUseQuestion: (question: string) => void;
  disabled?: boolean;
  pending?: boolean;
  showNudge?: boolean;
  hasBeenShown?: boolean;
  onHintOpen?: () => void;
  onDismissNudge?: () => void;
  availableHeight?: number;
  onFadeOutComplete?: () => void;
};

// 文章量に合わせて伸びても、ふくらみのある雲の輪郭を保つ。
function ThoughtCloud() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 250"
      preserveAspectRatio="none"
      className={styles.cloudShape}
    >
      <path d="M66 210C30 217 5 189 15 160C-1 140 4 111 25 96C11 65 38 36 73 43C81 10 124 1 150 26C173 4 215 5 237 28C268 8 307 22 314 48C349 34 381 59 376 89C405 104 406 140 383 160C396 192 366 222 333 212C315 241 275 248 250 224C227 247 184 247 165 226C133 250 91 237 86 214C79 216 72 214 66 210Z" />
    </svg>
  );
}

export function HmwHintCharacter({
  decidedIssue,
  onUseQuestion,
  disabled = false,
  pending = false,
  showNudge = false,
  hasBeenShown = false,
  onHintOpen,
  onDismissNudge,
  availableHeight,
  onFadeOutComplete,
}: HmwHintCharacterProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [groupIndex, setGroupIndex] = useState(0);
  const [selection, setSelection] = useState<{
    issue: string | null;
    question: string;
  } | null>(null);
  const queuedQuestion = useRef<string | null>(null);
  const questionRef = useRef<HTMLElement>(null);
  const firstWordRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [teaserDismissed, setTeaserDismissed] = useState(false);
  const [writing, setWriting] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hasAppeared, setHasAppeared] = useState(showNudge || hasBeenShown);
  if ((showNudge || hasBeenShown) && !hasAppeared) setHasAppeared(true);
  const question = selection?.issue === decidedIssue ? selection.question : "";
  const tooLong = question.length > NOTE_CONTENT_MAX_LENGTH;
  const hasIssue = Boolean(decidedIssue?.trim());
  const teaserVisible = showNudge && !open && !writing && !teaserDismissed;

  useEffect(
    () => () => {
      queuedQuestion.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!writing || pending) return;
    const timeout = window.setTimeout(() => {
      setWriting(false);
      setExiting(true);
    }, 1400);
    return () => window.clearTimeout(timeout);
  }, [writing, pending]);
  useEffect(() => {
    if (!exiting) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches;
    const timeout = window.setTimeout(
      () => {
        setDismissed(true);
        onFadeOutComplete?.();
      },
      reduceMotion ? 0 : 480,
    );
    return () => window.clearTimeout(timeout);
  }, [exiting, onFadeOutComplete]);
  useEffect(() => {
    if (!open) return;
    const target = question ? questionRef.current : firstWordRef.current;
    target?.focus({ preventScroll: true });
  }, [open, question]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setSelection(null);
      setSubmitting(false);
      setWriting(false);
      setExiting(false);
      setTeaserDismissed(true);
      onHintOpen?.();
    }
  };

  if (!hasAppeared || dismissed) return null;

  return (
    <div
      className={styles.character}
      data-testid="hmw-hint-character"
      data-engaged={open || teaserVisible || writing}
      data-nudge={showNudge}
      data-writing={writing}
      data-exiting={exiting}
      data-expanded={open}
    >
      {teaserVisible ? (
        <div
          className={styles.teaser}
          data-nudge={showNudge}
          data-testid="hmw-hint-nudge"
        >
          <ThoughtCloud />
          <button
            type="button"
            className={styles.teaserButton}
            aria-haspopup="dialog"
            aria-expanded={false}
            onClick={() => handleOpenChange(true)}
          >
            <span>
              こんな見た目も
              <br />
              あるかも...
            </span>
          </button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className={styles.teaserClose}
            aria-label="呼びかけを閉じる"
            onClick={() => {
              setTeaserDismissed(true);
              onDismissNudge?.();
            }}
          >
            <X aria-hidden="true" />
          </Button>
          <span aria-hidden="true" className={styles.thoughtTrail} />
        </div>
      ) : null}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={submitting}
            aria-label="問いのヒントを開く"
            className={styles.trigger}
          >
            <span className={styles.characterHalo} aria-hidden="true" />
            <Image
              src="/landing/mood-g.webp"
              alt=""
              width={80}
              height={77}
              className={styles.characterImage}
              draggable={false}
            />
            <span className={styles.triggerLabel}>ヒント</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={-92}
          data-stage={question ? "question" : "words"}
          data-compact={
            (availableHeight !== undefined && availableHeight < 180) ||
            undefined
          }
          style={
            availableHeight === undefined
              ? undefined
              : ({
                  "--hmw-cloud-max-height": `${availableHeight}px`,
                } as CSSProperties)
          }
          collisionPadding={12}
          aria-labelledby={titleId}
          className={`${styles.popover} rounded-none border-0 bg-transparent p-0 shadow-none data-[state=open]:animate-none data-[state=closed]:animate-none`}
          onOpenAutoFocus={(event) => {
            if (!firstWordRef.current) return;
            event.preventDefault();
            firstWordRef.current.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            const text = queuedQuestion.current;
            if (text === null) return;
            event.preventDefault();
            queuedQuestion.current = null;
            setSubmitting(false);
            // 吹き出しを閉じた後に追加し、新規本文へfocusする既存経路へ渡す。
            onUseQuestion(text);
          }}
        >
          <h2 id={titleId} className="sr-only">
            問いのヒント
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.cloudClose}
            aria-label="問いのヒントを閉じる"
            onClick={() => setOpen(false)}
          >
            <X aria-hidden="true" />
          </Button>
          <div className={styles.cloudEntrance}>
            <div
              className={styles.cloud}
              data-stage={question ? "question" : "words"}
              data-testid="hmw-thought-cloud"
            >
              <ThoughtCloud />
              {hasIssue ? (
                question ? (
                  <div className={styles.example}>
                    <p className={styles.cloudCaption}>
                      こんな問いはどうかな？
                    </p>
                    <section
                      ref={questionRef}
                      aria-label="問いの文例"
                      // biome-ignore lint/a11y/noNoninteractiveTabindex: 長い文例のスクロールをキーボードでも操作できるようにする。
                      tabIndex={0}
                      className={styles.question}
                    >
                      <p>{question}</p>
                    </section>
                    {tooLong ? (
                      <p role="alert" className={styles.error}>
                        {NOTE_CONTENT_MAX_LENGTH}文字を超えるため使えません。
                        問いを付箋に直接書くこともできます。
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.wordsContent}>
                    <p className={styles.cloudCaption}>こんなのはどうかな？</p>
                    <fieldset
                      aria-label="考え方のワード"
                      className={styles.words}
                    >
                      {HMW_HINT_GROUPS[groupIndex].map((hint, index) => (
                        <button
                          key={hint.id}
                          ref={index === 0 ? firstWordRef : undefined}
                          type="button"
                          className={styles.word}
                          onClick={() => {
                            const text = buildHmwHintQuestion(
                              decidedIssue,
                              hint,
                            );
                            if (text)
                              setSelection({
                                issue: decidedIssue,
                                question: text,
                              });
                          }}
                        >
                          {hint.word}
                        </button>
                      ))}
                    </fieldset>
                  </div>
                )
              ) : (
                <p role="status" className={styles.missingIssue}>
                  決定した課題を確認できません。接続後にもう一度確認してください。
                </p>
              )}
              <span aria-hidden="true" className={styles.thoughtTrail} />
            </div>
          </div>
          <div
            className={styles.characterChoices}
            data-stage={question ? "question" : "words"}
          >
            {question ? (
              <>
                <Button
                  type="button"
                  className={styles.chooseQuestion}
                  disabled={disabled || pending || submitting || tooLong}
                  onClick={() => {
                    if (submitting) return;
                    queuedQuestion.current = question;
                    setSubmitting(true);
                    setWriting(true);
                    setOpen(false);
                  }}
                >
                  <PencilLine aria-hidden="true" />
                  この問いにする
                  <ArrowRight aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.chooseAgain}
                  onClick={() => setSelection(null)}
                >
                  別のワードを選択する
                </Button>
              </>
            ) : hasIssue ? (
              <Button
                type="button"
                variant="outline"
                className={styles.otherWords}
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
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {writing ? (
        <div className={styles.writing}>
          <div className={styles.writingPaper} aria-hidden="true">
            <span />
            <span />
            <span />
            <PencilLine className={styles.pencil} />
          </div>
          <span role="status">いっしょに書き出そう</span>
        </div>
      ) : null}
    </div>
  );
}
