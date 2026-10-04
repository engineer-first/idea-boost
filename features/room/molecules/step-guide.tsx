"use client";

import { ArrowDown, CircleHelp, Clock3 } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { FacilitationGuideContent } from "../logic/facilitation-guide";
import { type StepGuideState, useStepGuide } from "../logic/use-step-guide";
import styles from "./step-guide.module.css";

export type StepGuideProps = {
  guide: FacilitationGuideContent;
  phaseKey: string;
  sessionKey: string;
  isHost: boolean;
  isReady: boolean;
  initialState?: StepGuideState;
};

export function StepGuide({ guide, isHost, ...options }: StepGuideProps) {
  const { state, setState, setHovered, setFocused } = useStepGuide(options);
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const detail = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const focusDetail = useRef(false);
  const id = useId();
  function openDetail() {
    focusDetail.current = true;
    restoreFocus.current = false;
    setState("detail");
  }

  useEffect(() => {
    if (state === "detail" && focusDetail.current) {
      focusDetail.current = false;
      detail.current?.focus({ preventScroll: true });
    }
    if (state === "compact" && restoreFocus.current) {
      restoreFocus.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [state]);

  useEffect(() => {
    if (state === "compact") return;
    function outside(event: Event) {
      if (
        !(event.target instanceof Node) ||
        root.current?.contains(event.target)
      )
        return;
      if (
        document.activeElement instanceof HTMLElement &&
        root.current?.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      // preventDefault / stopPropagation は使わず、付箋や操作ボタンへ同じ入力を届ける。
      setState("compact");
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      restoreFocus.current = true;
      setState("compact");
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("click", outside, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [state, setState]);

  return (
    <section
      ref={root}
      aria-label="進め方"
      data-testid="step-guide"
      data-state={state}
      className={`${styles.guide} pointer-events-auto border border-primary/20 bg-background text-foreground shadow-lg shadow-black/5`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(false);
        if (event.relatedTarget !== null) setState("compact");
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={state === "detail"}
        aria-controls={`${id}-detail`}
        aria-label="進め方"
        aria-hidden={state !== "compact"}
        inert={state !== "compact"}
        className={`${styles.layer} ${styles.compact} text-primary focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring`}
        onClick={openDetail}
      >
        <CircleHelp aria-hidden="true" className="size-4" />
        進め方
      </button>
      <div
        role="status"
        aria-label="最初の一歩"
        aria-atomic="true"
        tabIndex={state === "intro" ? 0 : -1}
        inert={state !== "intro"}
        aria-hidden={state !== "intro"}
        className={`${styles.layer} ${styles.intro} text-sm leading-6 text-primary`}
      >
        <p>{guide.intro}</p>
        <button
          type="button"
          aria-controls={`${id}-detail`}
          aria-expanded={state === "detail"}
          className={styles.introLink}
          onClick={openDetail}
        >
          進め方を見る
        </button>
      </div>
      <section
        ref={detail}
        id={`${id}-detail`}
        aria-label="ファシリテーションガイド"
        aria-describedby={`${id}-title`}
        tabIndex={-1}
        inert={state !== "detail"}
        aria-hidden={state !== "detail"}
        data-no-footer={
          !guide.completion && !guide.hostMessage ? "true" : undefined
        }
        className={`${styles.layer} ${styles.detail} focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring`}
      >
        <h2 id={`${id}-title`} className="text-lg leading-7 font-semibold">
          {guide.action ?? guide.modalTitle ?? guide.message}
        </h2>
        <dl className="mt-2 space-y-4 text-sm leading-6">
          <div>
            <dt
              className={
                guide.firstAction
                  ? "sr-only"
                  : "text-xs font-semibold text-muted-foreground"
              }
            >
              {guide.firstAction ? "まず" : "いまやること"}
            </dt>
            <dd className={guide.firstAction ? undefined : "mt-1"}>
              {guide.firstAction ?? guide.message}
            </dd>
          </div>
          {guide.visualExample && (
            <div>
              <dt className="sr-only">操作の例</dt>
              <dd>
                <figure
                  aria-labelledby={`${id}-example`}
                  className={styles.example}
                >
                  <figcaption
                    id={`${id}-example`}
                    className="text-xs font-semibold"
                  >
                    {guide.visualExample.caption}
                  </figcaption>
                  <ol
                    className={styles.exampleItems}
                    data-grouped={guide.visualExample.grouped || undefined}
                    data-flow={guide.visualExample.flow || undefined}
                  >
                    {guide.visualExample.items.map((item) => (
                      <li key={item}>
                        {guide.visualExample?.flow && (
                          <ArrowDown
                            aria-hidden="true"
                            className={styles.flowArrow}
                          />
                        )}
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                </figure>
              </dd>
            </div>
          )}
          {guide.purpose && (
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                何のため？
              </dt>
              <dd className="mt-1">{guide.purpose}</dd>
            </div>
          )}
          {guide.steps && (
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                進め方
              </dt>
              <dd className="mt-1">
                <ol className="list-decimal space-y-1 pl-5">
                  {guide.steps.map((step) => (
                    <li key={step} className="whitespace-pre-line">
                      {step}
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
          )}
          {guide.modalExamples && !guide.visualExample && (
            <div className="rounded-lg bg-muted/50 p-3">
              <dt className="text-xs font-semibold text-muted-foreground">
                たとえば
              </dt>
              <dd className="mt-1 space-y-1">
                {guide.modalExamples.map((example) => (
                  <p key={example}>{example}</p>
                ))}
              </dd>
            </div>
          )}
          {guide.example && (
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                コツ
              </dt>
              <dd>{guide.example}</dd>
            </div>
          )}
          {guide.completion && (
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">
                次へ進む目安
              </dt>
              <dd className="mt-1">{guide.completion}</dd>
            </div>
          )}
        </dl>
        {isHost && (guide.hostMessage || guide.hostTimerGuide) && (
          <div className="mt-4 border-t border-border pt-3 text-xs leading-5">
            <p className="font-semibold">進行役へ</p>
            {guide.hostTimerGuide && (
              <p className="mt-2 text-muted-foreground">
                <Clock3 aria-hidden="true" className="mr-1 inline size-4" />
                {guide.hostTimerGuide}
              </p>
            )}
            {guide.hostMessage && (
              <p className="mt-2 whitespace-pre-line text-muted-foreground">
                {guide.hostMessage}
              </p>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
