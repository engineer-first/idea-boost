"use client";

import { CircleHelp } from "lucide-react";
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
        onClick={() => {
          focusDetail.current = true;
          setState("detail");
          // inert の解除後にフォーカスする。自動案内ではフォーカスを移さない。
          restoreFocus.current = false;
        }}
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
      </div>
      <section
        ref={detail}
        id={`${id}-detail`}
        aria-label="ファシリテーションガイド"
        aria-describedby={`${id}-title`}
        tabIndex={-1}
        inert={state !== "detail"}
        aria-hidden={state !== "detail"}
        className={`${styles.layer} ${styles.detail} focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring`}
      >
        <p className="text-xs font-semibold text-primary">進め方</p>
        <h2 id={`${id}-title`} className="mt-1 text-lg leading-7 font-semibold">
          {guide.modalTitle ?? guide.message}
        </h2>
        <dl className="mt-4 space-y-4 text-sm leading-6">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">
              いまやること
            </dt>
            <dd className="mt-1">{guide.message}</dd>
          </div>
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
          {guide.modalExamples && (
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
        {isHost && guide.hostMessage && (
          <div className="mt-4 border-t border-border pt-3 text-xs leading-5">
            <p className="font-semibold">進行役へ</p>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">
              {guide.hostMessage}
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
