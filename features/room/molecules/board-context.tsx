"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { getNoteHeight, NOTE_DEFAULT_FONT_SIZE } from "@/contracts/board";
import type { RoomPhase } from "@/contracts/phase";
import type { Carryover } from "@/contracts/room-protocol";
import { DotVoteSticker } from "@/features/dot-vote";
import { StickyNote } from "@/features/notes";
import styles from "./board-context.module.css";
import { BoardLocation } from "./board-location";

export type BoardContextProps = {
  phase: RoomPhase;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
  issueReference?: Carryover | null;
  hmwReference?: Carryover | null;
};

export function BoardContext({
  phase,
  hmwDecidedIssue,
  decidedHmw,
  issueReference,
  hmwReference,
}: BoardContextProps) {
  const phaseKey = phase.kind === "step" ? String(phase.phase) : "lobby";
  const initialId =
    phase.kind === "step"
      ? phase.phase === 3
        ? "hmw"
        : phase.phase === 2
          ? "issue"
          : null
      : null;
  const [openState, setOpenState] = useState<{
    phaseKey: string;
    id: string | null;
  }>({ phaseKey, id: initialId });
  if (openState.phaseKey !== phaseKey) {
    setOpenState({ phaseKey, id: initialId });
  }
  const openDisclosureId =
    openState.phaseKey === phaseKey ? openState.id : initialId;
  const id = useId();
  const disclosures = [
    {
      id: "hmw",
      label: "決定した問い",
      content: decidedHmw,
      reference: hmwReference,
    },
    {
      id: "issue",
      label: "決定した課題",
      content: hmwDecidedIssue,
      reference: issueReference,
    },
  ].filter((item) => item.content !== null);

  return (
    <header
      data-testid="board-context-hud"
      className="pointer-events-none min-w-0 shrink-0"
    >
      <BoardLocation phase={phase} />
      {disclosures.length > 0 ? (
        <div
          className={`${styles.references} board-hud pointer-events-auto w-[200px] space-y-2 pt-2`}
        >
          {disclosures.map((disclosure) => {
            const isOpen = openDisclosureId === disclosure.id;
            const triggerId = `${id}-${disclosure.id}-trigger`;
            const contentId = `${id}-${disclosure.id}-content`;

            return (
              <section
                key={disclosure.id}
                className="w-[200px]"
                data-testid={
                  disclosure.id === "hmw" || disclosure.id === "issue"
                    ? `board-reference-${disclosure.id}`
                    : `board-context-${disclosure.id}`
                }
                data-open={isOpen}
              >
                <button
                  id={triggerId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={contentId}
                  className="flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-left text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() =>
                    setOpenState({
                      phaseKey,
                      id: isOpen ? null : disclosure.id,
                    })
                  }
                >
                  {disclosure.id === "hmw" || disclosure.id === "issue" ? (
                    <Check
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                  <span className="flex-1">{disclosure.label}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-3.5 shrink-0 text-muted-foreground ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <section
                  id={contentId}
                  aria-labelledby={triggerId}
                  aria-hidden={!isOpen}
                  inert={!isOpen}
                  hidden={!isOpen}
                  data-open={isOpen}
                  className={styles.disclosure}
                >
                  <div className={`${styles.disclosureInner} p-2 -mx-2`}>
                    <StickyNote
                      noteId={
                        disclosure.reference?.noteId ??
                        `reference-${disclosure.id}`
                      }
                      color={disclosure.reference?.color ?? null}
                      isDecided
                      height={Math.min(
                        240,
                        getNoteHeight(
                          disclosure.content ?? "",
                          disclosure.reference?.fontSize ??
                            NOTE_DEFAULT_FONT_SIZE,
                        ),
                      )}
                      className={styles.referenceNote}
                    >
                      <section
                        data-testid={`board-reference-${disclosure.id}-content`}
                        tabIndex={isOpen ? 0 : -1}
                        aria-label={`${disclosure.label}の本文`}
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        style={{
                          fontSize:
                            disclosure.reference?.fontSize ??
                            NOTE_DEFAULT_FONT_SIZE,
                          lineHeight: 1.5,
                        }}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {disclosure.content}
                        </p>
                      </section>
                      <div className="flex h-10 shrink-0 items-center gap-2 px-2 pb-2">
                        {disclosure.reference?.dotVotes ? (
                          <>
                            <DotVoteSticker
                              kind="subjective"
                              state="result"
                              count={disclosure.reference.dotVotes.subjective}
                            />
                            <DotVoteSticker
                              kind="objective"
                              state="result"
                              count={disclosure.reference.dotVotes.objective}
                            />
                          </>
                        ) : null}
                        <span
                          role="status"
                          aria-label="採用済み"
                          className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-emerald-700 text-white shadow-lg"
                        >
                          <Check
                            aria-hidden="true"
                            className="size-5"
                            strokeWidth={3}
                          />
                        </span>
                      </div>
                    </StickyNote>
                  </div>
                </section>
              </section>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}
