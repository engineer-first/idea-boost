"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  SHARING_REACTION_DURATION_MS,
  type SharingReactionKind,
} from "@/contracts/sharing-reactions";
import { SHARING_REACTION_OPTIONS } from "../logic/sharing-reaction-options";
import styles from "./sharing-reaction-display.module.css";

const REACTION_DRIFT_PX = [0, -64, 64, -96, 96, 32];

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
  if (reactions.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
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
          className={styles.reaction}
          role="img"
          aria-label={SHARING_REACTION_OPTIONS[reaction.kind].label}
          style={
            {
              "--reaction-drift": `${REACTION_DRIFT_PX[reaction.slot % REACTION_DRIFT_PX.length] ?? 0}px`,
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
