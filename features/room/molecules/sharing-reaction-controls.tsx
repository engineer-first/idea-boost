"use client";

import { Smile } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import toolMotion from "@/components/ui/tool-motion.module.css";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SHARING_REACTION_KINDS,
  type SharingReactionKind,
} from "@/contracts/sharing-reactions";
import { SHARING_REACTION_OPTIONS } from "../logic/sharing-reaction-options";
import { useSharingReactionMotion } from "../logic/use-sharing-reaction-motion";
import styles from "./sharing-reaction-controls.module.css";

export type SharingReactionControlsProps = {
  disabled: boolean;
  onSendReaction: (kind: SharingReactionKind) => void;
};

type ReactionToolbarAnchor = {
  getBoundingClientRect: () => DOMRect;
  readonly contextElement: Element | undefined;
};

export function SharingReactionControls({
  disabled,
  onSendReaction,
}: SharingReactionControlsProps) {
  const [open, setOpen] = useState(false);
  const motion = useSharingReactionMotion(disabled);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<ReactionToolbarAnchor>({
    getBoundingClientRect() {
      const trigger = triggerRef.current;
      const toolbar = trigger?.closest("[data-sharing-reaction-anchor]");
      return (toolbar ?? trigger)?.getBoundingClientRect() ?? new DOMRect();
    },
    get contextElement() {
      return (
        triggerRef.current?.closest("[data-sharing-reaction-anchor]") ??
        triggerRef.current ??
        undefined
      );
    },
  });

  return (
    <TooltipProvider delayDuration={1000}>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          motion.stop();
          if (!nextOpen || !disabled) setOpen(nextOpen);
        }}
      >
        <PopoverAnchor virtualRef={anchorRef} />
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                ref={triggerRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="リアクション"
                aria-disabled={disabled}
                className={`${toolMotion.button} aria-disabled:opacity-50 aria-disabled:hover:bg-transparent`}
              >
                <Smile aria-hidden="true" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">リアクション</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="top"
          align="end"
          aria-label="リアクションを選ぶ"
          className={`${styles.bar} flex w-max items-center justify-center border-border bg-background shadow-tool`}
        >
          {SHARING_REACTION_KINDS.map((kind) => {
            const option = SHARING_REACTION_OPTIONS[kind];
            return (
              <Button
                key={kind}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={option.sendLabel}
                aria-disabled={disabled}
                className={`${styles.choice} aria-disabled:hover:bg-transparent`}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch")
                    motion.preview(event.currentTarget, true);
                }}
                onPointerLeave={(event) => motion.stop(event.currentTarget)}
                onPointerCancel={(event) => motion.stop(event.currentTarget)}
                onFocus={(event) => {
                  if (event.currentTarget.matches(":focus-visible"))
                    motion.preview(event.currentTarget);
                }}
                onBlur={(event) => motion.stop(event.currentTarget)}
                onKeyDown={(event) => {
                  if (
                    (event.key === "Enter" || event.key === " ") &&
                    (event.repeat || event.nativeEvent.isComposing)
                  )
                    event.preventDefault();
                }}
                onClick={(event) => {
                  if (disabled) return;
                  motion.press(event.currentTarget);
                  onSendReaction(kind);
                }}
              >
                <Image
                  src={option.imageSrc}
                  alt=""
                  width={28}
                  height={28}
                  loading="eager"
                  draggable={false}
                  className={`${styles.image} h-auto w-7 max-w-none shrink-0`}
                />
              </Button>
            );
          })}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
