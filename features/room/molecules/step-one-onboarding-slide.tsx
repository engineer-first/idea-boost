"use client";

import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getStepGuideSlides,
  type StepGuideSlide,
} from "../logic/step-guide-copy";
import { StepGuideIllustration } from "./step-guide-illustration";
import styles from "./step-one-onboarding-slide.module.css";

export type StepOneOnboardingSlideProps = {
  phaseKey: string;
  sessionKey: string;
  isReady: boolean;
};

type GuideClosingStyle = CSSProperties & {
  "--guide-target-x": string;
  "--guide-target-y": string;
  "--guide-target-mid-x": string;
  "--guide-target-mid-y": string;
  "--guide-target-scale-x": string;
  "--guide-target-scale-y": string;
};

function StepOneOnboardingIllustrationContent({
  kind,
  alt,
}: {
  kind: StepGuideSlide["illustration"];
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

  if (kind !== "many-notes" && kind !== "add-note") {
    return <StepGuideIllustration kind={kind} alt={alt} />;
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

function StepOneOnboardingIllustration(props: {
  kind: StepGuideSlide["illustration"];
  alt: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const updateScale = () => {
      if (canvas.offsetHeight === 0) return;
      setScale(Math.min(1, frame.clientHeight / canvas.offsetHeight));
    };
    updateScale();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScale);
    observer?.observe(frame);
    observer?.observe(canvas);
    return () => observer?.disconnect();
  });
  const isMedia = ["many-notes", "add-note", "operation-video"].includes(
    props.kind,
  );
  return (
    <div ref={frameRef} className={styles.illustrationFrame}>
      <div
        ref={canvasRef}
        className={`${styles.illustrationCanvas} ${isMedia ? styles.mediaIllustration : ""}`}
        style={{ "--illustration-scale": scale } as CSSProperties}
      >
        <StepOneOnboardingIllustrationContent {...props} />
      </div>
    </div>
  );
}

export function StepOneOnboardingSlide({
  phaseKey,
  sessionKey,
  isReady,
}: StepOneOnboardingSlideProps) {
  const [open, setOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideTransition, setSlideTransition] = useState<"moving" | null>(null);
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
  const slides = getStepGuideSlides(phaseKey);
  const slide = slides[slideIndex] ?? slides[0];
  const previewSlide = slideTransition
    ? slides[pendingSlideIndexRef.current]
    : undefined;
  const isLastSlide = slideIndex === slides.length - 1;

  const finishCloseToGuide = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(false);
  };

  useEffect(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSlideTransition(null);
    setSlideIndex(0);
    pendingSlideIndexRef.current = 0;
    setIsClosingToGuide(false);
    setClosingStyle(null);
    if (!isReady || getStepGuideSlides(phaseKey).length === 0) {
      activeVisitRef.current = null;
      setOpen(false);
      return;
    }

    const storageKey = `step-onboarding:${sessionKey}:${phaseKey}`;
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
    setOpen(true);
  }, [isReady, phaseKey, sessionKey]);

  useEffect(() => {
    if (slideTransition === null) return;

    const timeoutId = window.setTimeout(() => {
      setSlideIndex(pendingSlideIndexRef.current);
      setSlideTransition(null);
    }, 300);

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
      targetIndex >= slides.length ||
      targetIndex === slideIndex
    ) {
      return;
    }
    pendingSlideIndexRef.current = targetIndex;
    setSlideDirection(direction);
    setSlideTransition("moving");
  };

  const advanceSlide = () => {
    if (isLastSlide) return;
    transitionToSlide(slideIndex + 1, "forward");
  };

  const renderPage = (item: StepGuideSlide, preview: boolean) => (
    <div
      aria-hidden={preview || undefined}
      className={`${styles.slidePage} ${preview ? styles.previewPage : styles.currentPage}`}
      onAnimationEnd={
        preview
          ? undefined
          : (event) => {
              if (
                event.target !== event.currentTarget ||
                slideTransition === null
              )
                return;
              setSlideIndex(pendingSlideIndexRef.current);
              setSlideTransition(null);
            }
      }
    >
      <figure className={styles.illustration}>
        {item.videoSrc ? (
          <video
            aria-label={item.illustrationAlt}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="h-full w-full object-contain"
            src={item.videoSrc}
          />
        ) : (
          <StepOneOnboardingIllustration
            kind={item.illustration}
            alt={item.illustrationAlt}
          />
        )}
      </figure>
      <DialogHeader className={styles.slideText}>
        {preview ? (
          <>
            <h2 className="text-xl font-semibold leading-snug">{item.title}</h2>
            <p className="max-w-2xl text-balance text-sm leading-6 text-muted-foreground">
              {item.description}
            </p>
          </>
        ) : (
          <>
            <DialogTitle className="text-xl leading-snug">
              {item.title}
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-balance text-sm leading-6">
              {item.description}
            </DialogDescription>
          </>
        )}
      </DialogHeader>
    </div>
  );

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
      {isReady && slides.length > 0 ? (
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
        open={open && isReady && slide !== undefined}
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
        {slide ? (
          <DialogContent
            ref={dialogRef}
            onCloseAutoFocus={(event) => {
              if (!guideButtonRef.current) return;
              event.preventDefault();
              guideButtonRef.current.focus();
            }}
            data-closing-to-guide={isClosingToGuide ? "true" : undefined}
            className={`${styles.dialog} gap-0 rounded-[28px] border-border bg-background text-foreground shadow-2xl data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 ${isClosingToGuide ? styles.flyToGuide : ""}`}
            style={{
              top: "50%",
              translate: "-50% -50%",
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
              className={styles.slideContent}
            >
              <div className="flex justify-center">
                <ol
                  aria-label="スライドの進捗"
                  className="m-0 flex list-none items-center gap-1.5 p-0"
                >
                  {slides.map((item, index) => (
                    <li
                      key={item.title}
                      aria-current={index === slideIndex ? "step" : undefined}
                      aria-label={`${index + 1}枚目 / 全${slides.length}枚`}
                    >
                      <button
                        aria-label={`${index + 1}枚目に戻る`}
                        className="flex h-8 w-fit items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={
                          slideTransition !== null || index >= slideIndex
                        }
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
              <div
                className={`${styles.slideViewport} ${slideTransition ? (slideDirection === "forward" ? styles.movingForward : styles.movingBackward) : ""}`}
              >
                {renderPage(slide, false)}
                {previewSlide ? renderPage(previewSlide, true) : null}
              </div>
              <DialogFooter className="mt-4 shrink-0 justify-center sm:justify-center">
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
        ) : null}
      </Dialog>
    </>
  );
}
