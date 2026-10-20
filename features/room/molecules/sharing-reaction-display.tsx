"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SHARING_REACTION_DURATION_MS } from "@/contracts/sharing-reactions";
import styles from "./sharing-reaction-display.module.css";

const REACTION_DRIFT_PX = [0, -64, 64, -96, 96, 32];

export type SharingReactionDisplayProps = {
  reactions: ReadonlyArray<{ id: string; slot: number }>;
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
          aria-label="いいね"
          style={
            {
              "--reaction-drift": `${REACTION_DRIFT_PX[reaction.slot % REACTION_DRIFT_PX.length] ?? 0}px`,
              animationDuration: `${SHARING_REACTION_DURATION_MS}ms`,
            } as CSSProperties
          }
        >
          <Image
            src="/reactions/like-3d.webp"
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
