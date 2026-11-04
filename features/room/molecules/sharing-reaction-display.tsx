"use client";

import Image from "next/image";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SHARING_REACTION_DURATION_MS,
  type SharingReactionKind,
} from "@/contracts/sharing-reactions";
import { SHARING_REACTION_OPTIONS } from "../logic/sharing-reaction-options";
import {
  chooseSharingReactionPosition,
  type ReactionBounds,
} from "../logic/sharing-reaction-placement";
import styles from "./sharing-reaction-display.module.css";

export type SharingReactionDisplayProps = {
  reactions: ReadonlyArray<{
    id: string;
    slot: number;
    kind: SharingReactionKind;
  }>;
};

export function SharingReactionDisplay({
  reactions,
}: SharingReactionDisplayProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const display = displayRef.current;
    if (!display) {
      setPositions((current) => (Object.keys(current).length ? {} : current));
      return;
    }
    const activeIds = new Set(reactions.map(({ id }) => id));
    const elements = Array.from(
      display.querySelectorAll<HTMLElement>("[data-reaction-id]"),
    ).filter((element) => activeIds.has(element.dataset.reactionId ?? ""));
    const existing = elements.filter(
      (element) => positions[element.dataset.reactionId ?? ""] !== undefined,
    );
    const occupied: ReactionBounds[] = existing.map((element) =>
      element.getBoundingClientRect(),
    );
    const next: Record<string, number> = {};
    for (const element of elements) {
      const id = element.dataset.reactionId ?? "";
      if (positions[id] !== undefined) {
        next[id] = positions[id];
        continue;
      }
      const track = display.getBoundingClientRect();
      const size = element.getBoundingClientRect().width;
      const bottom = element.getBoundingClientRect().bottom;
      const area = {
        left: track.left,
        right: track.right,
        top: bottom - size,
        bottom,
        size,
      };
      const position = chooseSharingReactionPosition(
        area,
        occupied,
        Math.random(),
      );
      next[id] = position;
      const left =
        area.left + Math.max(0, area.right - area.left - size) * position;
      occupied.push({ left, right: left + size, top: area.top, bottom });
    }
    if (
      Object.keys(next).length !== Object.keys(positions).length ||
      Object.keys(next).some((id) => next[id] !== positions[id])
    )
      setPositions(next);
  }, [reactions, positions]);

  if (reactions.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={displayRef}
      className={styles.display}
      role="status"
      aria-label="届いたリアクション"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
    >
      {reactions.map((reaction) => (
        <span
          key={reaction.id}
          data-reaction-id={reaction.id}
          className={styles.reaction}
          role="img"
          aria-label={SHARING_REACTION_OPTIONS[reaction.kind].label}
          style={
            {
              "--reaction-position": positions[reaction.id] ?? 0.5,
              "--reaction-drift":
                (positions[reaction.id] ?? 0.5) > 0.5 ? -0.08 : 0.08,
              visibility:
                positions[reaction.id] === undefined ? "hidden" : "visible",
              animationName:
                positions[reaction.id] === undefined ? "none" : undefined,
              animationDuration: `${SHARING_REACTION_DURATION_MS}ms`,
            } as CSSProperties
          }
        >
          <Image
            src={SHARING_REACTION_OPTIONS[reaction.kind].imageSrc}
            alt=""
            width={80}
            height={80}
            loading="eager"
            draggable={false}
            className={styles.image}
          />
        </span>
      ))}
    </div>,
    document.body,
  );
}
