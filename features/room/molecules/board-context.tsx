"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getNoteHeight, NOTE_DEFAULT_FONT_SIZE } from "@/contracts/board";
import type { RoomPhase } from "@/contracts/phase";
import type { Carryover } from "@/contracts/room-protocol";
import { DotVoteSticker } from "@/features/dot-vote";
import { StickyNote } from "@/features/notes";
import { isIdeaMapViewportStep } from "../logic/idea-value-feasibility-map";
import styles from "./board-context.module.css";
import { BoardLocation } from "./board-location";

export type BoardContextProps = {
  initialDisclosureId?: "hmw" | "issue" | null;
  phase: RoomPhase;
  outcomePublished?: boolean;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
  issueReference?: Carryover | null;
  hmwReference?: Carryover | null;
};

export function BoardContext({
  initialDisclosureId,
  phase,
  outcomePublished,
  hmwDecidedIssue,
  decidedHmw,
  issueReference,
  hmwReference,
}: BoardContextProps) {
  const phaseKey = phase.kind === "step" ? String(phase.phase) : "lobby";
  const usesIdeaMapViewport = isIdeaMapViewportStep(phase);
  const defaultInitialId =
    phase.kind === "step"
      ? phase.phase === 3
        ? "hmw"
        : phase.phase === 2
          ? "issue"
          : null
      : null;
  const initialId =
    initialDisclosureId === undefined ? defaultInitialId : initialDisclosureId;
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
      <BoardLocation phase={phase} outcomePublished={outcomePublished} />
      {disclosures.length > 0 ? (
        <div
          className={`${styles.references} board-hud pointer-events-auto pt-2 ${usesIdeaMapViewport ? "grid w-full grid-cols-2 items-stretch gap-2 max-[639px]:grid-cols-1" : "w-[200px] space-y-2"}`}
          data-layout={usesIdeaMapViewport ? "map-workspace" : "stacked"}
          data-testid="board-context-references"
        >
          {disclosures.map((disclosure) => {
            const isOpen = openDisclosureId === disclosure.id;
            const triggerId = `${id}-${disclosure.id}-trigger`;
            const contentId = `${id}-${disclosure.id}-content`;
            const note = (
              <StickyNote
                noteId={
                  disclosure.reference?.noteId ?? `reference-${disclosure.id}`
                }
                color={disclosure.reference?.color ?? null}
                isDecided
                decisionPresentation="reference"
                height={Math.min(
                  240,
                  getNoteHeight(
                    disclosure.content ?? "",
                    disclosure.reference?.fontSize ?? NOTE_DEFAULT_FONT_SIZE,
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
                      disclosure.reference?.fontSize ?? NOTE_DEFAULT_FONT_SIZE,
                    lineHeight: 1.5,
                  }}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {disclosure.content}
                  </p>
                </section>
                <div className="grid h-16 shrink-0 content-center gap-1 pl-2 pr-16">
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
                </div>
              </StickyNote>
            );
            const trigger = (
              <button
                id={triggerId}
                type="button"
                aria-label={usesIdeaMapViewport ? disclosure.label : undefined}
                aria-expanded={isOpen}
                aria-controls={contentId}
                className="flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-left text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={
                  usesIdeaMapViewport
                    ? undefined
                    : () =>
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
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  <span className="shrink-0">{disclosure.label}</span>
                  {usesIdeaMapViewport ? (
                    <span
                      className="min-w-0 truncate font-normal text-muted-foreground"
                      title={disclosure.content ?? undefined}
                    >
                      {disclosure.content}
                    </span>
                  ) : null}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`size-3.5 shrink-0 text-muted-foreground ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
            );

            return (
              <section
                key={disclosure.id}
                className={
                  usesIdeaMapViewport ? "relative min-w-0" : "w-[200px]"
                }
                data-testid={
                  disclosure.id === "hmw" || disclosure.id === "issue"
                    ? `board-reference-${disclosure.id}`
                    : `board-context-${disclosure.id}`
                }
                data-open={isOpen}
              >
                {usesIdeaMapViewport ? (
                  <Popover
                    open={isOpen}
                    onOpenChange={(open) =>
                      setOpenState({
                        phaseKey,
                        id: open ? disclosure.id : null,
                      })
                    }
                  >
                    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                    <PopoverContent
                      id={contentId}
                      aria-labelledby={triggerId}
                      side="bottom"
                      align="start"
                      sideOffset={8}
                      collisionPadding={8}
                      onInteractOutside={(event) => {
                        const originalTarget =
                          event.detail.originalEvent.target;
                        if (
                          originalTarget instanceof Element &&
                          originalTarget.closest(
                            '[data-testid="board-scroller"], [data-testid="board-location-card"]',
                          )
                        )
                          event.preventDefault();
                      }}
                      className="z-[60] w-[216px] max-w-[calc(100vw-1rem)] border-0 bg-transparent p-2 shadow-none"
                      data-testid={`board-reference-${disclosure.id}-popover`}
                    >
                      {note}
                    </PopoverContent>
                  </Popover>
                ) : (
                  <>
                    {trigger}
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
                        {note}
                      </div>
                    </section>
                  </>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}
