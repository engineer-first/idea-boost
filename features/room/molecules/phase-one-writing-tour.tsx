"use client";

import { type Driver, type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect, useRef, useState } from "react";
import type { RoomPhase } from "@/contracts/phase";
import "./phase-one-writing-tour.css";
import styles from "./phase-one-writing-tour.module.css";

const DEMO_CONTENT = "会議で発言するタイミングがわからない";
const DEMO_NOTE_WIDTH = 192;
const DEMO_NOTE_HEIGHT = 136;

type TourStage =
  | "add"
  | "write"
  | "share-presenter"
  | "share-source"
  | "share-target"
  | "done";

type PhaseOneWritingTourProps = {
  phase: RoomPhase;
};

export function PhaseOneWritingTour({ phase }: PhaseOneWritingTourProps) {
  const [stage, setStage] = useState<TourStage>("add");
  const [content, setContent] = useState("");
  const [notePosition, setNotePosition] = useState({ left: 24, top: 180 });
  const driverRef = useRef<Driver | null>(null);
  const timersRef = useRef<number[]>([]);

  const isFirstStep =
    phase.kind === "step" && phase.phase === 1 && phase.step === 1;
  const isSharingStep =
    phase.kind === "step" && phase.phase === 1 && phase.step === 2;

  useEffect(() => {
    if ((!isFirstStep && !isSharingStep) || window.innerWidth < 768) return;

    const addButton = document.querySelector<HTMLElement>(
      '[aria-label="付箋を追加"]',
    );
    if (!addButton) return;

    const toolbar = document.querySelector<HTMLElement>(
      '[data-testid="private-notes-toolbar"]',
    );
    if (isSharingStep) {
      setStage("share-presenter");
      setContent(DEMO_CONTENT);
      toolbar
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="マイ付箋を開く"]',
        )
        ?.click();
    }

    const tour = driver({
      animate: true,
      duration: 450,
      stagePadding: 0,
      stageRadius: 8,
      overlayOpacity: 0.72,
      allowClose: false,
      allowKeyboardControl: false,
      overlayClickBehavior: "none",
      popoverClass: "phase-one-writing-tour-popover",
      nextBtnText: "次へ",
      doneBtnText: "終了",
      onDoneClick: () => {
        tour.destroy();
        setStage("done");
      },
      steps: [
        ...(isFirstStep
          ? [
              {
                element: '[aria-label="付箋を追加"]',
                disableActiveInteraction: true,
                popover: {
                  description: "このボタンで付箋を追加します。",
                  side: "left",
                  showButtons: ["next"],
                  onNextClick: () => {
                    setStage("write");
                    const toolbar = document.querySelector<HTMLElement>(
                      '[data-testid="private-notes-toolbar"]',
                    );
                    const toolbarBox = toolbar?.getBoundingClientRect();
                    if (toolbarBox) {
                      setNotePosition({
                        left: Math.max(16, toolbarBox.left + 12),
                        top: Math.min(
                          window.innerHeight - 220,
                          toolbarBox.top + 72,
                        ),
                      });
                    }
                    tour.moveNext();
                    typeDemoText();
                  },
                },
              },
              {
                element: '[data-tour="phase-one-demo-note"]',
                waitForElement: 3_000,
                popover: {
                  description: "最近困ったことを書き出しましょう。",
                  side: "left",
                  showButtons: ["next"],
                },
              },
            ]
          : [
              {
                element: '[aria-label="発表者と全体の順番を確認"]',
                waitForElement: 3_000,
                popover: {
                  description:
                    "ここに自分の名前が表示されたら、付箋を共有して発表しましょう。",
                  side: "bottom",
                  showButtons: ["next"],
                  onNextClick: () => {
                    setStage("share-source");
                    window.requestAnimationFrame(() => {
                      window.requestAnimationFrame(() => {
                        const guidance = document.querySelector<HTMLElement>(
                          '[data-testid="private-notes-scroll"] p',
                        );
                        const guidanceBox = guidance?.getBoundingClientRect();
                        if (guidanceBox) {
                          setNotePosition({
                            left: guidanceBox.left,
                            top: guidanceBox.bottom + 12,
                          });
                        }
                        tour.moveNext();
                      });
                    });
                  },
                },
              },
              {
                element: '[data-tour="phase-one-share-source"]',
                disableActiveInteraction: true,
                waitForElement: 3_000,
                popover: {
                  description: "付箋をボードにドラッグして共有します。",
                  side: "left",
                  showButtons: ["next"],
                  onNextClick: () => {
                    setStage("share-target");
                    document.body.classList.add(
                      "phase-one-writing-tour-moving",
                    );
                    setNotePosition({
                      left: Math.max(
                        16,
                        (window.innerWidth - DEMO_NOTE_WIDTH) / 2,
                      ),
                      top: Math.max(
                        16,
                        (window.innerHeight - DEMO_NOTE_HEIGHT) / 2,
                      ),
                    });
                    refreshDuringMovement();
                    waitForMovementEnd();
                  },
                },
              },
              {
                element: '[data-tour="phase-one-share-target"]',
                waitForElement: 3_000,
                popover: {
                  description: "ここにドラッグするとメンバーに共有されます。",
                  side: "right",
                  align: "center",
                  showButtons: ["next"],
                  onPopoverRender: () =>
                    window.requestAnimationFrame(positionFinalPopover),
                },
              },
            ]),
      ] as DriveStep[],
    });
    driverRef.current = tour;
    tour.drive();

    const refresh = () => {
      tour.refresh();
      if (tour.getActiveIndex() === 2)
        window.requestAnimationFrame(positionFinalPopover);
    };
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(refresh);
    if (toolbar) resizeObserver?.observe(toolbar);
    const boardRoot = document.querySelector<HTMLElement>(
      '[data-testid="room-board-view-root"]',
    );
    const layoutObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(refresh);
    if (boardRoot) {
      layoutObserver?.observe(boardRoot, {
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    }
    const refreshFrame = window.requestAnimationFrame(refresh);

    function refreshDuringMovement() {
      let frameCount = 0;
      const update = () => {
        tour.refresh();
        frameCount += 1;
        if (frameCount < 45) window.requestAnimationFrame(update);
      };
      window.requestAnimationFrame(update);
    }

    function positionFinalPopover() {
      const note = document.querySelector<HTMLElement>(
        '[data-tour="phase-one-share-target"]',
      );
      const popover = document.querySelector<HTMLElement>(
        ".phase-one-writing-tour-popover",
      );
      if (!note || !popover) return;

      const noteBox = note.getBoundingClientRect();
      const popoverBox = popover.getBoundingClientRect();
      const left = Math.min(
        window.innerWidth - popoverBox.width - 16,
        noteBox.right + 12,
      );
      const top = Math.max(
        16,
        Math.min(
          window.innerHeight - popoverBox.height - 16,
          noteBox.top + noteBox.height / 2 - popoverBox.height / 2,
        ),
      );
      popover.style.left = `${left}px`;
      popover.style.right = "auto";
      popover.style.top = `${top}px`;
      popover.style.transform = "none";
    }

    function waitForMovementEnd() {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const note = document.querySelector<HTMLElement>(
            '[data-tour="phase-one-share-target"]',
          );
          let completed = false;
          const complete = () => {
            if (completed) return;
            completed = true;
            note?.removeEventListener("transitionend", complete);
            document.body.classList.remove("phase-one-writing-tour-moving");
            tour.moveNext();
          };
          note?.addEventListener("transitionend", complete);
          timersRef.current.push(window.setTimeout(complete, 750));
        });
      });
    }

    function typeDemoText() {
      let index = 0;
      const typeTimer = window.setInterval(() => {
        index += 1;
        setContent(DEMO_CONTENT.slice(0, index));
        if (index >= DEMO_CONTENT.length) {
          window.clearInterval(typeTimer);
        }
      }, 65);
      timersRef.current.push(typeTimer);
    }

    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
        window.clearInterval(timer);
      }
      timersRef.current = [];
      document.body.classList.remove("phase-one-writing-tour-moving");
      window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      resizeObserver?.disconnect();
      layoutObserver?.disconnect();
      tour.destroy();
      driverRef.current = null;
    };
  }, [isFirstStep, isSharingStep]);

  const isDesktop = typeof window === "undefined" || window.innerWidth >= 768;
  if ((!isFirstStep && !isSharingStep) || stage === "done" || !isDesktop)
    return null;

  const showDemoNote =
    stage === "write" || stage === "share-source" || stage === "share-target";
  const demoNoteTarget =
    stage === "share-source"
      ? "phase-one-share-source"
      : stage === "share-target"
        ? "phase-one-share-target"
        : "phase-one-demo-note";

  return (
    <div
      data-testid="phase-one-writing-tour"
      className={styles.layer}
      aria-hidden="true"
    >
      {showDemoNote ? (
        <div
          className={styles.demoNote}
          data-tour={demoNoteTarget}
          style={{ left: notePosition.left, top: notePosition.top }}
        >
          <textarea readOnly value={content} aria-label="デモの付箋" />
        </div>
      ) : null}
    </div>
  );
}
