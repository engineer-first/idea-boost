"use client";

import { ArrowRight, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PHASE_STEP_COUNTS,
  ROOM_PHASE_STEP_LABELS,
  type RoomPhase,
} from "@/contracts/phase";
import {
  getPhaseProgressState,
  PHASE_MARKERS,
  PHASE_NUMBERS,
  type PhaseNumber,
} from "../logic/phase-labels";
import styles from "./board-location.module.css";

const FLOW_STEPS = PHASE_NUMBERS.flatMap((phase) =>
  Array.from({ length: PHASE_STEP_COUNTS[phase] }, (_, index) => ({
    phase,
    step: index + 1,
  })),
);
type LocationState = "compact" | "expanded";
export type BoardLocationProps = {
  phase: RoomPhase;
  outcomePublished?: boolean;
  // 畳んだ現在地ボタンの右に並べる操作（「進め方」）。カードの高さは増やさない。
  action?: ReactNode;
};

export function BoardLocation({
  phase,
  outcomePublished = false,
  action,
}: BoardLocationProps) {
  const t = useTranslations("app.boardLocation");
  const translate = (key: string) => t(key as Parameters<typeof t>[0]);
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

  const title =
    phase.kind === "step"
      ? translate(`phaseTitles.${phase.phase}`)
      : t("waiting");
  const phaseName =
    phase.kind === "step" ? translate(`phaseNames.${phase.phase}`) : title;
  const currentPosition =
    phase.kind === "step"
      ? FLOW_STEPS.findIndex(
          (item) => item.phase === phase.phase && item.step === phase.step,
        ) + 1
      : 0;
  const stepLabel =
    phase.kind === "step"
      ? translate(`stepNames.${phase.phase}-${phase.step}`)
      : "";
  const fullStepLabel =
    phase.kind === "step"
      ? translate(`fullSteps.${phase.phase}-${phase.step}`)
      : title;
  return (
    <div className={styles.slot} data-testid="board-location-slot">
      <fieldset
        aria-label={t("currentLocation")}
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
            aria-label={
              phase.kind === "step"
                ? t("currentLocationToggle", {
                    phase: `${PHASE_MARKERS[phase.phase]} ${title}`,
                    step: fullStepLabel,
                    action: t(state === "compact" ? "open" : "close"),
                  })
                : t("currentLocationLobby", {
                    phase: title,
                    action: t(state === "compact" ? "open" : "close"),
                  })
            }
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
            <span className={styles.currentAction}>
              {phase.kind === "step" ? (
                <>
                  <span className={styles.currentPhase}>
                    {PHASE_MARKERS[phase.phase]}
                    {phaseName}
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
                  {t("next")}
                  {translate(`nextLabels.${phase.phase}-${phase.step}`)}
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
                aria-label={t("progressLabel")}
                aria-valuemin={0}
                aria-valuemax={FLOW_STEPS.length}
                aria-valuenow={currentPosition}
                aria-valuetext={t("progressText", {
                  total: FLOW_STEPS.length,
                  current: currentPosition,
                  step: fullStepLabel,
                })}
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
            aria-label={t("flowAria")}
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
                aria-label={t("phaseTabs")}
                data-testid="board-phase-progress"
                variant="line"
                className={styles.phases}
              >
                {PHASE_NUMBERS.map((number, index) => (
                  <Fragment key={number}>
                    <TabsTrigger
                      value={String(number)}
                      aria-label={t("phaseTabLabel", {
                        phase: translate(`phaseNames.${number}`),
                      })}
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
                      <span>{translate(`phaseNames.${number}`)}</span>
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
                  <ol aria-label={t("allPhaseSteps")} className={styles.steps}>
                    {Object.keys(ROOM_PHASE_STEP_LABELS[number]).map((step) => {
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
                              aria-label={t("completed")}
                              className={styles.stepMarker}
                            >
                              <Check aria-hidden="true" className="size-3.5" />
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
                            {translate(`fullSteps.${number}-${step}`)}
                          </span>
                          {current ? (
                            <span className={styles.currentLabel}>
                              {t("current")}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
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
