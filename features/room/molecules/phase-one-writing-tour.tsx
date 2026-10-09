"use client";

import { type Driver, type DriveStep, driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useEffect, useRef, useState } from "react";
import type { RoomPhase } from "@/contracts/phase";
import { DotVoteSticker } from "@/features/dot-vote";
import "./phase-one-writing-tour.css";
import styles from "./phase-one-writing-tour.module.css";

const DEMO_CONTENT = "会議で発言するタイミングがわからない";
const VOTE_DEMO_SECOND_CONTENT = "会議で一部の人だけが話してしまう";
const GROUP_DEMO_CONTENT = "会議で一部の人だけが話してしまう";
const GROUP_DEMO_THIRD_CONTENT = "会議で意見があっても言い出せない";
const GROUP_DEMO_NAME = "会議での発言";
const DEMO_NOTE_WIDTH = 192;
const DEMO_NOTE_HEIGHT = 136;

const DEMO_VOTES = [
  { id: "subjective-left", kind: "subjective", note: "left", right: 16 },
  { id: "objective-right", kind: "objective", note: "right", right: 16 },
  { id: "objective-left", kind: "objective", note: "left", right: 52 },
  { id: "objective-right-second", kind: "objective", note: "right", right: 52 },
] as const;

type TourStage =
  | "add"
  | "write"
  | "share-presenter"
  | "share-source"
  | "share-target"
  | "done";

type PhaseOneWritingTourProps = {
  phase: RoomPhase;
  isHost?: boolean;
};

export function PhaseOneWritingTour({
  phase,
  isHost = true,
}: PhaseOneWritingTourProps) {
  const [stage, setStage] = useState<TourStage>("add");
  const [content, setContent] = useState("");
  const [notePosition, setNotePosition] = useState({ left: 24, top: 180 });
  const driverRef = useRef<Driver | null>(null);
  const timersRef = useRef<number[]>([]);

  const isFirstStep =
    phase.kind === "step" && phase.phase === 1 && phase.step === 1;
  const isSharingStep =
    phase.kind === "step" && phase.phase === 1 && phase.step === 2;
  const isGroupingStep =
    phase.kind === "step" && phase.phase === 1 && phase.step === 3;
  const isVotingStep =
    phase.kind === "step" && phase.phase === 1 && phase.step === 4;
  const isDecisionStep =
    phase.kind === "step" && phase.phase === 1 && phase.step === 5;

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

  if (isGroupingStep) return <PhaseOneGroupingTour />;
  if (isVotingStep) return <PhaseOneVotingTour />;
  if (isDecisionStep) return <PhaseOneDecisionTour isHost={isHost} />;

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

function PhaseOneGroupingTour() {
  const [stage, setStage] = useState<"source" | "frame" | "name-edit" | "done">(
    "source",
  );
  const [groupName, setGroupName] = useState("グループ");
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (window.innerWidth < 768) return;

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
          element: '[data-tour="phase-one-group-demo"]',
          disableActiveInteraction: true,
          popover: {
            description: "似ている付箋を近づけて、まとめましょう。",
            side: "left",
            showButtons: ["next"],
            onNextClick: () => {
              setStage("frame");
              document.body.classList.add("phase-one-writing-tour-moving");
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  const note = document.querySelector<HTMLElement>(
                    '[data-tour="phase-one-group-moving-note"]',
                  );
                  let completed = false;
                  let fallbackTimer = 0;
                  const finish = () => {
                    if (completed) return;
                    completed = true;
                    window.clearTimeout(fallbackTimer);
                    document.body.classList.remove(
                      "phase-one-writing-tour-moving",
                    );
                    tour.moveNext();
                  };
                  note?.addEventListener("transitionend", finish, {
                    once: true,
                  });
                  fallbackTimer = window.setTimeout(finish, 750);
                  timersRef.current.push(fallbackTimer);
                });
              });
            },
          },
        },
        {
          element: '[data-tour="phase-one-group-frame"]',
          waitForElement: 3_000,
          popover: {
            description: "近づけると、グループの枠ができます。",
            side: "left",
            showButtons: ["next"],
            onNextClick: () => {
              setStage("name-edit");
              requestAnimationFrame(() => {
                tour.moveNext();
                typeGroupName();
              });
            },
          },
        },
        {
          element: '[data-tour="phase-one-group-name-input"]',
          waitForElement: 3_000,
          popover: {
            description: "グループ名を入力して、まとまりに名前を付けましょう。",
            side: "left",
            showButtons: ["next"],
          },
        },
      ] as DriveStep[],
    });
    tour.drive();

    function typeGroupName() {
      let index = 0;
      setGroupName("");
      const timer = window.setInterval(() => {
        index += 1;
        setGroupName(GROUP_DEMO_NAME.slice(0, index));
        if (index >= GROUP_DEMO_NAME.length) window.clearInterval(timer);
      }, 90);
      timersRef.current.push(timer);
    }

    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
        window.clearInterval(timer);
      }
      timersRef.current = [];
      document.body.classList.remove("phase-one-writing-tour-moving");
      tour.destroy();
    };
  }, []);

  const isDesktop = typeof window === "undefined" || window.innerWidth >= 768;
  if (stage === "done" || !isDesktop) return null;

  const grouped = stage !== "source";
  const isNameEditing = stage === "name-edit";
  return (
    <div
      data-testid="phase-one-writing-tour"
      className={styles.layer}
      aria-hidden="true"
    >
      <div
        className={`${styles.groupDemo} ${grouped ? styles.grouped : ""}`}
        data-tour={grouped ? "phase-one-group-frame" : "phase-one-group-demo"}
      >
        <div className={styles.groupNote} data-testid="phase-one-group-note">
          {DEMO_CONTENT}
        </div>
        <div
          className={styles.groupNote}
          data-tour="phase-one-group-moving-note"
          data-testid="phase-one-group-note"
        >
          {GROUP_DEMO_CONTENT}
        </div>
        <div className={styles.groupNote} data-testid="phase-one-group-note">
          {GROUP_DEMO_THIRD_CONTENT}
        </div>
        {grouped ? (
          <div
            className={styles.groupOutline}
            data-testid="phase-one-group-outline"
          />
        ) : null}
        {grouped ? (
          <div className={styles.groupHeader} data-tour="phase-one-group-name">
            {isNameEditing ? (
              <input
                type="text"
                readOnly
                value={groupName}
                aria-label="グループ名を入力"
                data-tour="phase-one-group-name-input"
              />
            ) : (
              groupName
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PhaseOneVotingTour() {
  const [stage, setStage] = useState<
    "subjective" | "objective" | "target" | "done"
  >("subjective");
  const [visibleVoteCount, setVisibleVoteCount] = useState(0);
  const [arrivedVoteIds, setArrivedVoteIds] = useState<string[]>([]);
  const [sourceOffsets, setSourceOffsets] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (window.innerWidth < 768) return;

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
          element:
            '[data-vote-palette="true"] button[aria-label^="主観シール"]',
          disableActiveInteraction: true,
          waitForElement: 3_000,
          popover: {
            description:
              "主観は1票。激しく共感する、取り組みたい付箋に貼りましょう。",
            side: "top",
            showButtons: ["next"],
          },
        },
        {
          element:
            '[data-vote-palette="true"] button[aria-label^="客観シール"]',
          disableActiveInteraction: true,
          waitForElement: 3_000,
          popover: {
            description:
              "客観は3票。自分以外の人にも価値がありそうな付箋に貼りましょう。",
            side: "top",
            showButtons: ["next"],
            onNextClick: () => {
              startVoteAnimation();
            },
          },
        },
        {
          element: "body",
          waitForElement: 3_000,
          popover: {
            description:
              "2枚の付箋へシールをドラッグして投票します。投票中は、自分のシールだけが見えます。",
            side: "left",
            showButtons: ["next"],
          },
        },
      ] as DriveStep[],
    });
    tour.drive();

    function startVoteAnimation() {
      setSourceOffsets(getSourceOffsets());
      setStage("target");
      setVisibleVoteCount(DEMO_VOTES.length);
      setArrivedVoteIds([]);
      document.body.classList.add("phase-one-writing-tour-moving");

      for (const [voteIndex, vote] of DEMO_VOTES.entries()) {
        const timer = window.setTimeout(
          () => {
            setArrivedVoteIds((current) => [...current, vote.id]);
          },
          40 + voteIndex * 120,
        );
        timersRef.current.push(timer);
      }

      const finishTimer = window.setTimeout(() => {
        document.body.classList.remove("phase-one-writing-tour-moving");
        tour.setConfig({ animate: false });
        tour.moveNext();
      }, 950);
      timersRef.current.push(finishTimer);
    }

    function getSourceOffsets() {
      const offsets: Record<string, { x: number; y: number }> = {};
      for (const vote of DEMO_VOTES) {
        const paletteButton = document.querySelector<HTMLElement>(
          `[data-vote-palette="true"] button[aria-label^="${vote.kind === "subjective" ? "主観" : "客観"}シール"]`,
        );
        const note = document.querySelector<HTMLElement>(
          `[data-vote-note="${vote.note}"]`,
        );
        if (!paletteButton || !note) {
          offsets[vote.id] = { x: 0, y: 0 };
          continue;
        }
        const paletteBox = paletteButton.getBoundingClientRect();
        const noteBox = note.getBoundingClientRect();
        const targetX = noteBox.width - vote.right - 14;
        const targetY = noteBox.height - 30;
        offsets[vote.id] = {
          x: paletteBox.left + paletteBox.width / 2 - noteBox.left - targetX,
          y: paletteBox.top + paletteBox.height / 2 - noteBox.top - targetY,
        };
      }
      return offsets;
    }

    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
        window.clearInterval(timer);
      }
      timersRef.current = [];
      document.body.classList.remove("phase-one-writing-tour-moving");
      tour.destroy();
    };
  }, []);

  const isDesktop = typeof window === "undefined" || window.innerWidth >= 768;
  if (stage === "done" || !isDesktop) return null;

  return (
    <div
      data-testid="phase-one-writing-tour"
      className={styles.layer}
      aria-hidden="true"
    >
      <div
        className={styles.voteDemoBoard}
        data-testid="phase-one-voting-demo-note"
      >
        <div className={styles.voteDemoNote} data-vote-note="left">
          {DEMO_CONTENT}
          {DEMO_VOTES.filter((vote) => vote.note === "left")
            .slice(0, visibleVoteCount)
            .map((vote) => (
              <span
                key={vote.id}
                className={`${styles.voteDemoSticker} ${
                  arrivedVoteIds.includes(vote.id)
                    ? styles.voteDemoStickerArrived
                    : ""
                }`}
                data-tour={
                  vote.id === "subjective-left"
                    ? "phase-one-voting-demo-sticker"
                    : undefined
                }
                data-testid="phase-one-voting-demo-sticker"
                data-vote-demo-kind={vote.kind}
                data-vote-demo-note={vote.note}
                style={{
                  right: vote.right,
                  bottom: 16,
                  ["--source-x" as string]: `${sourceOffsets[vote.id]?.x ?? 0}px`,
                  ["--source-y" as string]: `${sourceOffsets[vote.id]?.y ?? 0}px`,
                }}
              >
                <DotVoteSticker kind={vote.kind} count={1} state="confirmed" />
              </span>
            ))}
        </div>
        <div className={styles.voteDemoNote} data-vote-note="right">
          {VOTE_DEMO_SECOND_CONTENT}
          {DEMO_VOTES.filter((vote) => vote.note === "right")
            .slice(0, visibleVoteCount)
            .map((vote) => (
              <span
                key={vote.id}
                className={`${styles.voteDemoSticker} ${
                  arrivedVoteIds.includes(vote.id)
                    ? styles.voteDemoStickerArrived
                    : ""
                }`}
                data-testid="phase-one-voting-demo-sticker"
                data-vote-demo-kind={vote.kind}
                data-vote-demo-note={vote.note}
                style={{
                  right: vote.right,
                  bottom: 16,
                  ["--source-x" as string]: `${sourceOffsets[vote.id]?.x ?? 0}px`,
                  ["--source-y" as string]: `${sourceOffsets[vote.id]?.y ?? 0}px`,
                }}
              >
                <DotVoteSticker kind={vote.kind} count={1} state="confirmed" />
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

function PhaseOneDecisionTour({ isHost }: { isHost: boolean }) {
  const [stage, setStage] = useState<
    "result" | "selecting" | "confirmed" | "host" | "done"
  >(isHost ? "result" : "result");

  useEffect(() => {
    if (window.innerWidth < 768) return;

    const hostSteps: DriveStep[] = [
      {
        element: '[data-testid="phase-one-decision-demo-note"]',
        popover: {
          description:
            "みんなの投票結果を参考に、取り組む課題を1つ話し合いましょう。",
          side: "left",
          showButtons: ["next"],
        },
      },
      {
        element: () =>
          findButtonByText(
            '[data-testid="phase-loop-hud"]',
            "採用する付箋を選ぶ",
          ),
        waitForElement: 3_000,
        popover: {
          description:
            "課題が決まったら、このボタンで採用する付箋の選択を始めます。",
          side: "top",
          showButtons: ["next"],
          onNextClick: () => {
            setStage("selecting");
            window.requestAnimationFrame(() => tour.moveNext());
          },
        },
      },
      {
        element: '[data-tour="phase-one-decision-demo-selected"]',
        waitForElement: 3_000,
        popover: {
          description: "取り組む課題の付箋をクリックすると、確定します。",
          side: "left",
          showButtons: ["next"],
          onNextClick: () => {
            setStage("confirmed");
            window.requestAnimationFrame(() => tour.moveNext());
          },
        },
      },
      {
        element: '[data-tour="phase-one-decision-demo-confirmed"]',
        waitForElement: 3_000,
        popover: {
          description:
            "確定した課題は全員に表示されます。次へ進む前なら、取り消して選び直せます。",
          side: "top",
          showButtons: ["next"],
        },
      },
    ];
    const participantSteps: DriveStep[] = [
      {
        element: '[data-testid="phase-one-decision-demo-note"]',
        popover: {
          description:
            "投票結果を参考に、取り組む課題をみんなで話し合いましょう。",
          side: "left",
          showButtons: ["next"],
          onNextClick: () => {
            setStage("host");
            window.requestAnimationFrame(() => tour.moveNext());
          },
        },
      },
      {
        element: '[data-tour="phase-one-decision-demo-host"]',
        waitForElement: 3_000,
        popover: {
          description: "話し合って決めた課題は、ホストが確定します。",
          side: "top",
          showButtons: ["next"],
          onNextClick: () => {
            setStage("confirmed");
            window.requestAnimationFrame(() => tour.moveNext());
          },
        },
      },
      {
        element: '[data-tour="phase-one-decision-demo-confirmed"]',
        waitForElement: 3_000,
        popover: {
          description:
            "確定した課題はここに表示されます。次は、この課題から問いを考えます。",
          side: "top",
          showButtons: ["next"],
        },
      },
    ];
    const tour = driver({
      animate: false,
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
      steps: (isHost ? hostSteps : participantSteps) as DriveStep[],
    });
    tour.drive();

    return () => tour.destroy();
  }, [isHost]);

  const isDesktop = typeof window === "undefined" || window.innerWidth >= 768;
  if (stage === "done" || !isDesktop) return null;

  const isSelected = stage === "selecting" || stage === "confirmed";
  const isConfirmed = stage === "confirmed";
  return (
    <div
      data-testid="phase-one-writing-tour"
      className={styles.layer}
      aria-hidden="true"
    >
      <div
        className={`${styles.decisionDemoNote} ${
          isSelected ? styles.decisionDemoNoteSelected : ""
        }`}
        data-testid="phase-one-decision-demo-note"
        data-tour={isSelected ? "phase-one-decision-demo-selected" : undefined}
      >
        <p>{DEMO_CONTENT}</p>
        <div className={styles.decisionDemoResults}>
          <DotVoteSticker kind="subjective" count={2} state="result" />
          <DotVoteSticker kind="objective" count={4} state="result" />
        </div>
        {isConfirmed ? (
          <span
            className={styles.decisionDemoCheck}
            role="status"
            aria-label="取り組む課題に決定済み"
          >
            ✓
          </span>
        ) : null}
      </div>
      {!isHost && stage === "host" ? (
        <div
          className={styles.decisionDemoHost}
          data-tour="phase-one-decision-demo-host"
        >
          ホストが課題を確定します
        </div>
      ) : null}
      {isConfirmed ? (
        <div
          className={styles.decisionDemoConfirmed}
          data-tour="phase-one-decision-demo-confirmed"
        >
          <span>付箋を1件確定済み</span>
          <strong>{DEMO_CONTENT}</strong>
          {isHost ? <button type="button">確定を取り消す</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function findButtonByText(containerSelector: string, text: string): Element {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`${containerSelector} button`),
  ).find((candidate) => candidate.textContent?.includes(text));
  return button ?? document.body;
}
