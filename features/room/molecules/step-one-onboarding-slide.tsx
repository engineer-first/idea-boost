"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STEP_ONE_ONBOARDING_SLIDES } from "../logic/step-one-onboarding-copy";
import styles from "./step-one-onboarding-slide.module.css";

export type StepOneOnboardingSlideProps = {
  phaseKey: string;
  sessionKey: string;
  isReady: boolean;
};

const PHASE_KEY = "1-1";
type IllustrationKind =
  (typeof STEP_ONE_ONBOARDING_SLIDES)[number]["illustration"];
type GuideClosingStyle = CSSProperties & {
  "--guide-target-x": string;
  "--guide-target-y": string;
  "--guide-target-mid-x": string;
  "--guide-target-mid-y": string;
  "--guide-target-scale-x": string;
  "--guide-target-scale-y": string;
};

function StepOneOnboardingIllustration({
  kind,
  alt,
}: {
  kind: IllustrationKind;
  alt: string;
}) {
  if (kind === "operation-video") {
    return (
      <video
        aria-label={alt}
        autoPlay
        className="h-full w-full object-contain"
        loop
        muted
        playsInline
        preload="auto"
        src="/onboarding/operation-guide-placeholder.webm"
      />
    );
  }

  return (
    <svg
      aria-label={alt}
      className="h-full w-full"
      role="img"
      viewBox="0 0 640 270"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#f4f6f9" height="270" rx="24" width="640" />
      <circle cx="34" cy="36" fill="#e2e8f0" r="5" />
      <circle cx="52" cy="36" fill="#e2e8f0" r="5" />
      <circle cx="70" cy="36" fill="#e2e8f0" r="5" />
      <path d="M0 54h640" stroke="#e2e8f0" strokeWidth="2" />

      {kind === "many-notes" ? (
        <>
          <g transform="rotate(-5 165 158)">
            <rect
              fill="#f9e69b"
              height="142"
              rx="12"
              width="150"
              x="89"
              y="84"
            />
            <path
              d="M112 132h103M112 149h80"
              stroke="#c6a94f"
              strokeLinecap="round"
              strokeWidth="5"
            />
            <text
              fill="#514b38"
              fontSize="16"
              fontWeight="600"
              textAnchor="middle"
              x="164"
              y="185"
            >
              朝の支度が大変
            </text>
          </g>
          <g transform="rotate(4 321 158)">
            <rect
              fill="#d8eef8"
              height="142"
              rx="12"
              width="150"
              x="245"
              y="84"
            />
            <path
              d="M268 132h103M268 149h80"
              stroke="#8eb8ce"
              strokeLinecap="round"
              strokeWidth="5"
            />
            <text
              fill="#3b4f58"
              fontSize="16"
              fontWeight="600"
              textAnchor="middle"
              x="320"
              y="185"
            >
              忘れ物が多い
            </text>
          </g>
          <g transform="rotate(-3 477 158)">
            <rect
              fill="#dcebd8"
              height="142"
              rx="12"
              width="150"
              x="401"
              y="84"
            />
            <path
              d="M424 132h103M424 149h80"
              stroke="#91ae88"
              strokeLinecap="round"
              strokeWidth="5"
            />
            <text
              fill="#43533f"
              fontSize="16"
              fontWeight="600"
              textAnchor="middle"
              x="476"
              y="185"
            >
              片づけが続かない
            </text>
          </g>
        </>
      ) : null}

      {kind === "add-note" ? (
        <>
          <rect fill="#fff" height="174" rx="16" width="410" x="115" y="68" />
          <text fill="#526277" fontSize="15" fontWeight="600" x="143" y="103">
            マイ付箋
          </text>
          <rect
            fill="#fff"
            height="42"
            rx="10"
            stroke="#b8c3d2"
            strokeWidth="2"
            width="170"
            x="143"
            y="119"
          />
          <text
            fill="#334155"
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
            x="228"
            y="146"
          >
            ＋ 付箋を追加
          </text>
          <rect
            fill="#f9e69b"
            height="104"
            rx="10"
            width="168"
            x="331"
            y="119"
          />
          <path
            d="M350 151h120M350 168h92"
            stroke="#c6a94f"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <text fill="#514b38" fontSize="14" fontWeight="600" x="350" y="201">
            最近困ったこと…
          </text>
        </>
      ) : null}
    </svg>
  );
}

export function StepOneOnboardingSlide({
  phaseKey,
  sessionKey,
  isReady,
}: StepOneOnboardingSlideProps) {
  const [open, setOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideTransition, setSlideTransition] = useState<"out" | "in" | null>(
    null,
  );
  const [slideDirection, setSlideDirection] = useState<"forward" | "backward">(
    "forward",
  );
  const [isClosingToGuide, setIsClosingToGuide] = useState(false);
  const [closingStyle, setClosingStyle] = useState<GuideClosingStyle | null>(
    null,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pendingSlideIndexRef = useRef(0);
  const activeVisitRef = useRef<string | null>(null);
  const slide = STEP_ONE_ONBOARDING_SLIDES[slideIndex];
  const isLastSlide = slideIndex === STEP_ONE_ONBOARDING_SLIDES.length - 1;

  const finishCloseToGuide = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!isReady || phaseKey !== PHASE_KEY) {
      activeVisitRef.current = null;
      setOpen(false);
      return;
    }

    const storageKey = `step-onboarding:${sessionKey}:${PHASE_KEY}`;
    // StrictModeのEffect再実行では、この訪問で開いた案内を閉じない。
    if (activeVisitRef.current === storageKey) return;
    activeVisitRef.current = storageKey;
    try {
      if (sessionStorage.getItem(storageKey) === "seen") {
        setOpen(false);
        return;
      }
      sessionStorage.setItem(storageKey, "seen");
    } catch {
      // ストレージを使えない環境では、この表示中だけ一度表示する。
    }
    setIsClosingToGuide(false);
    setClosingStyle(null);
    pendingSlideIndexRef.current = 0;
    setSlideIndex(0);
    setOpen(true);
  }, [isReady, phaseKey, sessionKey]);

  useEffect(() => {
    if (slideTransition === null) return;

    const fallbackDuration = slideTransition === "out" ? 235 : 275;
    const timeoutId = window.setTimeout(() => {
      if (slideTransition === "out") {
        setSlideIndex(pendingSlideIndexRef.current);
        setSlideTransition("in");
      } else {
        setSlideTransition(null);
      }
    }, fallbackDuration);

    return () => window.clearTimeout(timeoutId);
  }, [slideTransition]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const openGuide = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosingToGuide(false);
    setClosingStyle(null);
    setSlideTransition(null);
    pendingSlideIndexRef.current = 0;
    setSlideIndex(0);
    setOpen(true);
  };

  const transitionToSlide = (
    targetIndex: number,
    direction: "forward" | "backward",
  ) => {
    if (
      slideTransition !== null ||
      targetIndex < 0 ||
      targetIndex >= STEP_ONE_ONBOARDING_SLIDES.length ||
      targetIndex === slideIndex
    ) {
      return;
    }
    pendingSlideIndexRef.current = targetIndex;
    setSlideDirection(direction);
    setSlideTransition("out");
  };

  const advanceSlide = () => {
    if (isLastSlide) return;
    transitionToSlide(slideIndex + 1, "forward");
  };

  const start = () => {
    const dialogElement = dialogRef.current;
    const guideButton = guideButtonRef.current;
    if (!dialogElement || !guideButton) {
      setOpen(false);
      return;
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setOpen(false);
      return;
    }

    const dialogBounds = dialogElement.getBoundingClientRect();
    const buttonBounds = guideButton.getBoundingClientRect();
    const targetX =
      buttonBounds.left +
      buttonBounds.width / 2 -
      (dialogBounds.left + dialogBounds.width / 2);
    const targetY =
      buttonBounds.top +
      buttonBounds.height / 2 -
      (dialogBounds.top + dialogBounds.height / 2);
    const scaleX =
      dialogBounds.width > 0
        ? Math.max(buttonBounds.width / dialogBounds.width, 0.01)
        : 0.08;
    const scaleY =
      dialogBounds.height > 0
        ? Math.max(buttonBounds.height / dialogBounds.height, 0.01)
        : 0.08;

    setClosingStyle({
      "--guide-target-x": `${targetX}px`,
      "--guide-target-y": `${targetY}px`,
      "--guide-target-mid-x": `${targetX * 0.76}px`,
      "--guide-target-mid-y": `${targetY * 0.76}px`,
      "--guide-target-scale-x": `${scaleX}`,
      "--guide-target-scale-y": `${scaleY}`,
    });
    setIsClosingToGuide(true);
    closeTimerRef.current = window.setTimeout(finishCloseToGuide, 380);
  };

  return (
    <>
      {isReady && phaseKey === PHASE_KEY ? (
        <Button
          ref={guideButtonRef}
          type="button"
          variant="outline"
          className="pointer-events-auto absolute left-1/2 top-0 z-40 h-9 -translate-x-1/2 rounded-full border-border/80 bg-background/95 px-4 text-sm shadow-lg backdrop-blur transition hover:bg-muted max-[639px]:fixed max-[639px]:top-[calc(var(--board-location-top,7.25rem)-3rem)]"
          onClick={openGuide}
        >
          進め方
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
            setIsClosingToGuide(false);
            setClosingStyle(null);
          }
          if (!nextOpen) setSlideTransition(null);
          setOpen(nextOpen);
        }}
      >
        <DialogContent
          ref={dialogRef}
          onCloseAutoFocus={(event) => {
            if (!guideButtonRef.current) return;
            event.preventDefault();
            guideButtonRef.current.focus();
          }}
          data-closing-to-guide={isClosingToGuide ? "true" : undefined}
          className={`max-h-[calc(100dvh-5rem)] w-[calc(100%-2rem)] max-w-[56rem] gap-0 overflow-y-auto rounded-[32px] border-border bg-background p-5 text-foreground shadow-2xl sm:p-8 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 ${isClosingToGuide ? styles.flyToGuide : ""}`}
          style={{
            top: "4rem",
            translate: "-50% 0",
            ...closingStyle,
            ...(isClosingToGuide && !open
              ? { animation: "none", opacity: 0, pointerEvents: "none" }
              : {}),
          }}
        >
          <div
            data-testid="step-one-onboarding-slide-content"
            data-slide-transition={slideTransition ?? "idle"}
            data-slide-direction={slideDirection}
            className={`${styles.slideContent} ${
              slideTransition === "out"
                ? slideDirection === "forward"
                  ? styles.slideOutLeft
                  : styles.slideOutRight
                : slideTransition === "in"
                  ? slideDirection === "forward"
                    ? styles.slideInFromRight
                    : styles.slideInFromLeft
                  : ""
            }`}
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              if (slideTransition === "out") {
                setSlideIndex(pendingSlideIndexRef.current);
                setSlideTransition("in");
              } else if (slideTransition === "in") {
                setSlideTransition(null);
              }
            }}
          >
            <div className="flex justify-center">
              <ol
                aria-label="スライドの進捗"
                className="m-0 flex list-none items-center gap-1.5 p-0"
              >
                {STEP_ONE_ONBOARDING_SLIDES.map((item, index) => (
                  <li
                    key={item.title}
                    aria-current={index === slideIndex ? "step" : undefined}
                    aria-label={`${index + 1}枚目 / 全${STEP_ONE_ONBOARDING_SLIDES.length}枚`}
                  >
                    <button
                      aria-label={`${index + 1}枚目に戻る`}
                      className="flex h-8 w-fit items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={slideTransition !== null || index >= slideIndex}
                      onClick={() => transitionToSlide(index, "backward")}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={`block h-1.5 rounded-full ${
                          index === slideIndex
                            ? "w-6 bg-primary"
                            : "w-3 bg-muted-foreground/25"
                        }`}
                      />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <figure className="mt-4 aspect-[64/27] max-h-[22rem] w-full overflow-hidden rounded-[24px] bg-muted/50 p-2 sm:mt-5 sm:p-3">
              <StepOneOnboardingIllustration
                kind={slide.illustration}
                alt={slide.illustrationAlt}
              />
            </figure>
            <DialogHeader className="mt-5 min-h-32 items-center justify-center gap-2 text-center">
              <DialogTitle className="text-xl leading-snug sm:text-2xl">
                {slide.title}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-balance text-sm leading-6 sm:text-base">
                {slide.description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 justify-center sm:justify-center">
              {isLastSlide ? (
                <Button
                  className="h-12 min-w-52 rounded-full px-8 text-base"
                  disabled={isClosingToGuide}
                  onClick={start}
                >
                  はじめる
                </Button>
              ) : (
                <Button
                  className="h-12 min-w-52 rounded-full px-8 text-base"
                  onClick={advanceSlide}
                >
                  次へ
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
