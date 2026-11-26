"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { PHASE_STEP_COUNTS, type RoomPhase } from "@/contracts/phase";
import {
  getNextStepShortName,
  getPhaseLabel,
  getPhaseTitle,
  PHASE_MARKERS,
  PHASE_SHORT_NAMES as PHASE_NAMES,
  PHASE_NUMBERS,
  STEP_SHORT_NAMES as STEP_NAMES,
} from "../logic/phase-labels";
import { BoardFlowSteps } from "./board-flow-steps";
import styles from "./board-location.module.css";

const FLOW_STEPS = PHASE_NUMBERS.flatMap((phase) =>
  Array.from({ length: PHASE_STEP_COUNTS[phase] }, (_, index) => ({
    phase,
    step: index + 1,
  })),
);

// 中央のステップバーが出る幅。board-location.module.css の narrowOnly の切り替えと揃える。
const WIDE_QUERY = "(width >= 900px)";

type LocationState = "compact" | "expanded";
export type BoardLocationProps = {
  phase: RoomPhase;
  outcomePublished?: boolean;
  // 畳んだ現在地ボタンの右に並べる操作（「進め方」）。カードの高さは増やさない。
  action?: ReactNode;
  // 中央のステップバーが出る広い画面（900px 以上）では、現在のステップ・全体の流れ・進め方を
  // ステップバーから開けるので、重ねて示さないよう現在地カードごと出さない。
  narrowOnly?: boolean;
};

export function BoardLocation({
  phase,
  outcomePublished = false,
  action,
  narrowOnly = false,
}: BoardLocationProps) {
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const [request, setRequest] = useState<{
    phaseKey: string;
    state: LocationState;
  }>({ phaseKey, state: "compact" });
  const state = request.phaseKey === phaseKey ? request.state : "compact";
  if (request.phaseKey !== phaseKey) setRequest({ phaseKey, state: "compact" });
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
    if (!narrowOnly || state === "compact" || !window.matchMedia) return;
    // 開いたまま広い画面へ変わるとカードは見えなくなるので閉じ、Escape や外側クリックを奪わない。
    const wide = window.matchMedia(WIDE_QUERY);
    function closeWhenWide(event: { matches: boolean }): void {
      if (event.matches) setRequest({ phaseKey, state: "compact" });
    }
    closeWhenWide(wide);
    wide.addEventListener("change", closeWhenWide);
    return () => wide.removeEventListener("change", closeWhenWide);
  }, [narrowOnly, state, phaseKey]);
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
  const currentPosition =
    phase.kind === "step"
      ? FLOW_STEPS.findIndex(
          (item) => item.phase === phase.phase && item.step === phase.step,
        ) + 1
      : 0;
  const stepLabel =
    phase.kind === "step" ? STEP_NAMES[phase.phase][phase.step - 1] : "";
  return (
    <div
      className={styles.slot}
      data-narrow-only={narrowOnly || undefined}
      data-testid="board-location-slot"
    >
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
        <div className={styles.row}>
          <button
            ref={trigger}
            type="button"
            aria-label={`現在地：${phase.kind === "step" ? `${PHASE_MARKERS[phase.phase]} ${title}・${getPhaseLabel(phase).replace(/^\d+-\d+\s*/, "")}` : title}。全体の流れを${state === "compact" ? "開く" : "閉じる"}`}
            aria-expanded={state !== "compact"}
            aria-controls={`${id}-detail`}
            data-testid="board-location-trigger"
            className={styles.trigger}
            onClick={() => {
              if (state !== "compact") {
                close();
                return;
              }
              setRequest({ phaseKey, state: "expanded" });
            }}
          >
            <span className={styles.currentAction}>
              {phase.kind === "step" ? (
                <>
                  <span className={styles.currentPhase}>
                    {PHASE_MARKERS[phase.phase]}
                    {PHASE_NAMES[phase.phase]}
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ｜
                  </span>
                  <span
                    className={styles.currentStep}
                    data-testid="board-location-step"
                  >
                    {stepLabel}
                  </span>
                </>
              ) : (
                <span className={styles.currentPhase}>{title}</span>
              )}
              {phase.kind === "step" && !outcomePublished && (
                <span className={styles.next}>
                  次：{getNextStepShortName(phase)}
                </span>
              )}
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className={styles.disclosure}
              data-expanded={state !== "compact"}
            >
              <path d="M2 4h8L6 8z" fill="currentColor" />
            </svg>
            {phase.kind === "step" ? (
              <span
                role="progressbar"
                aria-label="全工程の現在地"
                aria-valuemin={0}
                aria-valuemax={FLOW_STEPS.length}
                aria-valuenow={currentPosition}
                aria-valuetext={`全${FLOW_STEPS.length}工程の${currentPosition}番目。${getPhaseLabel(phase).replace(/^\d+-\d+\s*/, "")}`}
                className={styles.progressRail}
                data-testid="board-progress-rail"
              >
                {FLOW_STEPS.map((item, index) => (
                  <span
                    key={`${item.phase}-${item.step}`}
                    aria-hidden="true"
                    data-phase-start={item.phase !== 1 && item.step === 1}
                    data-reached={index < currentPosition}
                    data-current={index + 1 === currentPosition}
                  />
                ))}
              </span>
            ) : null}
          </button>
          {/* 全体の流れを開いている間は幅だけ残して隠し、Tabで手順へ進める。 */}
          {action ? (
            <span
              className={styles.action}
              aria-hidden={state !== "compact" || undefined}
              inert={state !== "compact"}
              data-hidden={state !== "compact"}
            >
              {action}
            </span>
          ) : null}
        </div>
        {state !== "compact" ? (
          <section
            id={`${id}-detail`}
            aria-label="全体の流れと手順"
            className={styles.detail}
          >
            <BoardFlowSteps phase={phase} />
          </section>
        ) : null}
      </fieldset>
    </div>
  );
}
