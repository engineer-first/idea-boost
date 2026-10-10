"use client";

import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import type { RoomPhase } from "@/contracts/phase";
import styles from "./board-context.module.css";
import { BoardLocation } from "./board-location";

export type BoardContextProps = {
  phase: RoomPhase;
  outcomePublished?: boolean;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
};

export function BoardContext({
  phase,
  outcomePublished,
  hmwDecidedIssue,
  decidedHmw,
}: BoardContextProps) {
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const [openState, setOpenState] = useState<{
    phaseKey: string;
    id: string | null;
  }>({ phaseKey, id: null });
  const openDisclosureId =
    openState.phaseKey === phaseKey ? openState.id : null;
  const id = useId();

  const disclosures: {
    id: string;
    label: string;
    content: ReactNode;
  }[] = [];

  const decisions = [
    { id: "hmw", label: "決定した問い", content: decidedHmw },
    { id: "issue", label: "決定した課題", content: hmwDecidedIssue },
  ].filter((item) => item.content !== null);

  for (const decision of decisions) {
    disclosures.push({
      id: decision.id,
      label: decision.label,
      content: (
        <div
          data-testid={`board-reference-${decision.id}-content`}
          className="max-h-24 overflow-y-auto overscroll-contain px-4 py-2"
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-5">
            {decision.content}
          </p>
        </div>
      ),
    });
  }

  return (
    <header
      data-testid="board-context-hud"
      className="pointer-events-none min-w-0 shrink-0"
    >
      <BoardLocation phase={phase} outcomePublished={outcomePublished} />
      {disclosures.length > 0 ? (
        <div className="board-hud pointer-events-auto overflow-hidden rounded-b-2xl border-x border-b border-border bg-background shadow-lg shadow-black/5">
          {disclosures.map((disclosure) => {
            const isOpen = openDisclosureId === disclosure.id;
            const triggerId = `${id}-${disclosure.id}-trigger`;
            const contentId = `${id}-${disclosure.id}-content`;

            return (
              <section
                key={disclosure.id}
                className="border-t border-border"
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
                  className="flex min-h-8 w-full cursor-pointer items-center gap-1.5 px-4 py-1.5 text-left text-xs font-medium outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
                  <div className={styles.disclosureInner}>
                    {disclosure.content}
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
