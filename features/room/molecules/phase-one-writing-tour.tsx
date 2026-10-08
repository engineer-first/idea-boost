"use client";

import { type Driver, driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect, useRef, useState } from "react";
import type { RoomPhase } from "@/contracts/phase";
import "./phase-one-writing-tour.css";
import styles from "./phase-one-writing-tour.module.css";

const DEMO_CONTENT = "会議で発言するタイミングがわからない";

type TourStage = "add" | "write" | "done";

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

  useEffect(() => {
    if (!isFirstStep || window.innerWidth < 768) return;

    const addButton = document.querySelector<HTMLElement>(
      '[aria-label="付箋を追加"]',
    );
    if (!addButton) return;

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
                  top: Math.min(window.innerHeight - 220, toolbarBox.top + 72),
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
      ],
    });
    driverRef.current = tour;
    tour.drive();

    const refresh = () => tour.refresh();
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    const toolbar = document.querySelector<HTMLElement>(
      '[data-testid="private-notes-toolbar"]',
    );
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
      window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      resizeObserver?.disconnect();
      layoutObserver?.disconnect();
      tour.destroy();
      driverRef.current = null;
    };
  }, [isFirstStep]);

  const isDesktop = typeof window === "undefined" || window.innerWidth >= 768;
  if (!isFirstStep || stage === "done" || !isDesktop) return null;

  return (
    <div
      data-testid="phase-one-writing-tour"
      className={styles.layer}
      aria-hidden="true"
    >
      {stage === "write" ? (
        <div
          className={styles.demoNote}
          data-tour="phase-one-demo-note"
          style={{ left: notePosition.left, top: notePosition.top }}
        >
          <textarea readOnly value={content} aria-label="デモの付箋" />
        </div>
      ) : null}
    </div>
  );
}
