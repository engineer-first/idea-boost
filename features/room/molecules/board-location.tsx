"use client";

import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PHASE_STEP_COUNTS,
  ROOM_PHASE_STEP_LABELS,
  type RoomPhase,
} from "@/contracts/phase";
import {
  getPhaseProgressState,
  getPhaseTitle,
  PHASE_NUMBERS,
  type PhaseNumber,
} from "../logic/phase-labels";
import styles from "./board-location.module.css";

const PROGRESS_STEPS = [1, 2, 3, 4, 5] as const;
const PHASE_MARKERS = { 1: "①", 2: "②", 3: "③" } as const;
const PHASE_NAMES = { 1: "課題", 2: "問い", 3: "アイデア" } as const;

type LocationState = "compact" | "expanded";
export type BoardLocationProps = { phase: RoomPhase };

export function BoardLocation({ phase }: BoardLocationProps) {
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const [request, setRequest] = useState<{
    phaseKey: string;
    state: LocationState;
  }>({ phaseKey, state: "compact" });
  const state = request.phaseKey === phaseKey ? request.state : "compact";
  if (request.phaseKey !== phaseKey) setRequest({ phaseKey, state: "compact" });
  const [viewedPhase, setViewedPhase] = useState<PhaseNumber>(
    phase.kind === "step" ? phase.phase : 1,
  );
  const card = useRef<HTMLFieldSetElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<{ element: HTMLElement; phaseKey: string } | null>(
    null,
  );
  const id = useId();
  function close(): void {
    setRequest({ phaseKey, state: "compact" });
  }
  useEffect(() => {
    const focused = lastFocused.current;
    // 工程変更で詳細内の要素が消えた場合にだけ、常設入口へ復帰する。
    if (
      focused &&
      focused.phaseKey !== phaseKey &&
      !focused.element.isConnected &&
      document.activeElement === document.body
    ) {
      trigger.current?.focus({ preventScroll: true });
    }
  }, [phaseKey]);
  useEffect(() => {
    if (state === "compact") return;
    function outside(event: Event): void {
      if (
        !(event.target instanceof Node) ||
        card.current?.contains(event.target)
      )
        return;
      // 元の付箋クリックやドラッグは消費しない。
      setRequest({ phaseKey, state: "compact" });
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setRequest({ phaseKey, state: "compact" });
      trigger.current?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("click", outside, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("click", outside, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [state, phaseKey]);

  const title = getPhaseTitle(phase);
  const stepCount = phase.kind === "step" ? PHASE_STEP_COUNTS[phase.phase] : 0;
  return (
    <div className={styles.slot}>
      <fieldset
        aria-label="現在地"
        ref={card}
        className={`${styles.card} board-hud`}
        data-state={state}
        data-location-open={state !== "compact"}
        data-testid="board-location-card"
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLElement)
            lastFocused.current = { element: event.target, phaseKey };
        }}
        onBlur={(event) => {
          if (
            event.relatedTarget !== null &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            close();
        }}
      >
        <button
          ref={trigger}
          type="button"
          aria-label={`現在地：${phase.kind === "step" ? `${title}・${phase.step}/${stepCount}` : title}`}
          aria-expanded={state !== "compact"}
          aria-controls={`${id}-detail`}
          data-testid="board-location-trigger"
          className={styles.trigger}
          onClick={() => {
            if (state !== "compact") {
              close();
              return;
            }
            setViewedPhase(phase.kind === "step" ? phase.phase : 1);
            setRequest({ phaseKey, state: "expanded" });
          }}
        >
          <span className="min-w-0 flex-1 text-left text-sm font-semibold whitespace-nowrap">
            {phase.kind === "step"
              ? `${PHASE_MARKERS[phase.phase]} ${title}・${phase.step}/${stepCount}`
              : title}
          </span>
          {phase.kind === "step" ? (
            <span
              role="progressbar"
              aria-label={`${title}の進行状況`}
              aria-valuemin={0}
              aria-valuemax={stepCount}
              aria-valuenow={phase.step}
              className={styles.dots}
              data-testid="board-progress-rail"
            >
              {PROGRESS_STEPS.slice(0, stepCount).map((step) => (
                <span
                  key={step}
                  aria-hidden="true"
                  data-reached={step <= phase.step}
                  data-current={step === phase.step}
                />
              ))}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 text-muted-foreground ${state !== "compact" ? "rotate-180" : ""}`}
          />
        </button>
        {state !== "compact" ? (
          <section
            id={`${id}-detail`}
            aria-label="全体の流れと手順"
            className={styles.detail}
          >
            <Tabs
              value={String(viewedPhase)}
              onValueChange={(value) =>
                setViewedPhase(Number(value) as PhaseNumber)
              }
              className="min-h-0 gap-0"
            >
              <TabsList
                aria-label="3つのフェーズの手順"
                data-testid="board-phase-progress"
                variant="line"
                className={styles.phases}
              >
                {PHASE_NUMBERS.map((number, index) => (
                  <Fragment key={number}>
                    <TabsTrigger
                      value={String(number)}
                      aria-label={`${PHASE_MARKERS[number]} ${PHASE_NAMES[number]}の手順`}
                      aria-current={
                        phase.kind === "step" && phase.phase === number
                          ? "step"
                          : undefined
                      }
                      data-phase-state={getPhaseProgressState(phase, number)}
                      data-testid={`board-phase-${number}`}
                      className={styles.phaseTab}
                    >
                      <span
                        aria-hidden="true"
                        className={styles.phaseNumber}
                        data-current={
                          phase.kind === "step" && phase.phase === number
                        }
                      >
                        {number}
                      </span>
                      <span>{PHASE_NAMES[number]}</span>
                    </TabsTrigger>
                    {index < 2 ? (
                      <ArrowRight
                        aria-hidden="true"
                        className="size-3 shrink-0 text-muted-foreground"
                      />
                    ) : null}
                  </Fragment>
                ))}
              </TabsList>
              {PHASE_NUMBERS.map((number) => (
                <TabsContent
                  key={number}
                  value={String(number)}
                  className={styles.stepScroll}
                >
                  <ol
                    aria-label="このフェーズの全手順"
                    className={styles.steps}
                  >
                    {Object.entries(ROOM_PHASE_STEP_LABELS[number]).map(
                      ([step, label]) => {
                        const current =
                          phase.kind === "step" &&
                          phase.phase === number &&
                          phase.step === Number(step);
                        const completed =
                          phase.kind === "step" &&
                          (number < phase.phase ||
                            (number === phase.phase &&
                              Number(step) < phase.step));
                        return (
                          <li
                            key={step}
                            aria-current={current ? "step" : undefined}
                            data-testid={
                              current ? "board-current-step" : undefined
                            }
                          >
                            {completed ? (
                              <span
                                role="img"
                                aria-label="完了"
                                className={styles.stepMarker}
                              >
                                <Check
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
                              </span>
                            ) : (
                              <span
                                aria-hidden="true"
                                className={styles.stepMarker}
                              >
                                {step}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 break-words">
                              {label.replace(/^\d+-\d+\s*/, "")}
                            </span>
                            {current ? (
                              <span className={styles.currentLabel}>現在</span>
                            ) : null}
                          </li>
                        );
                      },
                    )}
                  </ol>
                </TabsContent>
              ))}
            </Tabs>
          </section>
        ) : null}
      </fieldset>
    </div>
  );
}
