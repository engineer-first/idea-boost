"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ListOrdered,
  MessageSquare,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PHASE_STEP_COUNTS,
  ROOM_PHASE_STEP_LABELS,
  type RoomPhase,
} from "@/contracts/phase";
import {
  getPhaseLabel,
  getPhaseProgressState,
  getPhaseTitle,
  PHASE_NUMBERS,
  type PhaseNumber,
} from "../logic/phase-labels";
import styles from "./board-location.module.css";

const PROGRESS_STEPS = [1, 2, 3, 4, 5] as const;
const PHASE_MARKERS = { 1: "①", 2: "②", 3: "③" } as const;
const PHASE_NAMES = { 1: "課題", 2: "問い", 3: "アイデア" } as const;

type LocationState = "compact" | "overview" | "steps";
export type BoardLocationProps = {
  phase: RoomPhase;
  onOpenFeedback?: (returnFocusTo: HTMLButtonElement | null) => void;
};

export function BoardLocation({ phase, onOpenFeedback }: BoardLocationProps) {
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
  const overviewAction = useRef<HTMLButtonElement>(null);
  const backAction = useRef<HTMLButtonElement>(null);
  const nextFocus = useRef<"overview" | "steps" | null>(null);
  const id = useId();
  function changeState(next: LocationState): void {
    setRequest({ phaseKey, state: next });
  }
  function close(restoreFocus: boolean): void {
    changeState("compact");
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const focused = lastFocused.current;
    // サーバーの工程変更で読んでいた要素が消えたときだけ入口へ戻す。
    // 別の付箋や操作へ移っている本人のフォーカスは奪わない。
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
    if (nextFocus.current === "steps" && state === "steps")
      backAction.current?.focus({ preventScroll: true });
    if (nextFocus.current === "overview" && state === "overview")
      overviewAction.current?.focus({ preventScroll: true });
    nextFocus.current = null;
  }, [state]);
  useEffect(() => {
    if (state === "compact") return;
    function outside(event: Event): void {
      if (
        !(event.target instanceof Node) ||
        card.current?.contains(event.target)
      )
        return;
      // captureで畳むだけにし、同じ付箋へのクリックやドラッグを届ける。
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
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLElement)
            lastFocused.current = { element: event.target, phaseKey };
        }}
        data-testid="board-location-card"
        onBlur={(event) => {
          if (
            event.relatedTarget !== null &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            close(false);
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
          onClick={() =>
            state === "compact" ? changeState("overview") : close(false)
          }
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
            aria-label="現在地の詳細"
            className={styles.detail}
          >
            {state === "overview" ? (
              <div className={styles.body}>
                <nav
                  aria-label="アイデア出しのフェーズ進行"
                  data-testid="board-phase-progress"
                >
                  <ol className={styles.phases}>
                    {PHASE_NUMBERS.map((number, index) => {
                      const progress = getPhaseProgressState(phase, number);
                      return (
                        <li
                          key={number}
                          aria-current={
                            progress === "current" ? "step" : undefined
                          }
                          data-phase-state={progress}
                          data-testid={`board-phase-${number}`}
                        >
                          <span>
                            {PHASE_MARKERS[number]} {PHASE_NAMES[number]}
                          </span>
                          {index < 2 ? (
                            <ArrowRight
                              aria-hidden="true"
                              className="size-3 shrink-0 text-muted-foreground"
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </nav>
                <p
                  id="board-current-step"
                  data-testid="board-current-step"
                  className="mt-4 break-words text-base leading-6 font-semibold"
                >
                  {phase.kind === "step"
                    ? getPhaseLabel(phase).replace(/^\d+-\d+\s*/, "")
                    : "開始待ち"}
                  {phase.kind === "step" ? (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      ステップ {phase.step}/{stepCount}
                    </span>
                  ) : null}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    ref={overviewAction}
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      setViewedPhase(phase.kind === "step" ? phase.phase : 1);
                      nextFocus.current = "steps";
                      changeState("steps");
                    }}
                  >
                    <ListOrdered aria-hidden="true" className="size-4" />
                    全手順を見る
                  </Button>
                  {onOpenFeedback ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => {
                        close(false);
                        onOpenFeedback(trigger.current);
                      }}
                    >
                      <MessageSquare aria-hidden="true" className="size-4" />
                      フィードバック
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <Tabs
                value={String(viewedPhase)}
                onValueChange={(value) =>
                  setViewedPhase(Number(value) as PhaseNumber)
                }
                className="min-h-0 gap-0"
              >
                <div className="px-3 pt-3">
                  <TabsList
                    aria-label="閲覧するフェーズ"
                    className="h-11 w-full"
                  >
                    {PHASE_NUMBERS.map((number) => (
                      <TabsTrigger
                        key={number}
                        value={String(number)}
                        className="min-h-10 text-xs text-foreground"
                      >
                        {PHASE_MARKERS[number]} {PHASE_NAMES[number]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
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
                          const reached =
                            phase.kind === "step" &&
                            (number < phase.phase ||
                              (number === phase.phase &&
                                Number(step) < phase.step));
                          return (
                            <li
                              key={step}
                              aria-current={current ? "step" : undefined}
                            >
                              <span
                                aria-hidden="true"
                                className={styles.stepMarker}
                              >
                                {reached ? <Check className="size-4" /> : step}
                              </span>
                              <span className="min-w-0 flex-1 break-words">
                                {label.replace(/^\d+-\d+\s*/, "")}
                              </span>
                              {current ? (
                                <span className={styles.currentLabel}>
                                  現在
                                </span>
                              ) : null}
                            </li>
                          );
                        },
                      )}
                    </ol>
                  </TabsContent>
                ))}
              </Tabs>
            )}
            <div className={styles.footer}>
              {state === "steps" ? (
                <Button
                  ref={backAction}
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    nextFocus.current = "overview";
                    changeState("overview");
                  }}
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  概要に戻る
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => close(true)}
              >
                <X aria-hidden="true" className="size-4" />
                閉じる
              </Button>
            </div>
          </section>
        ) : null}
      </fieldset>
    </div>
  );
}
