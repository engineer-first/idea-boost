"use client";

import { Smile } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export type SharingReactionControlsProps = {
  disabled: boolean;
  onSendReaction: (kind: SharingReactionKind) => void;
};

export function SharingReactionControls({
  disabled,
  onSendReaction,
}: SharingReactionControlsProps) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={1000}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="リアクション"
                disabled={disabled}
              >
                <Smile aria-hidden="true" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">リアクション</TooltipContent>
        </Tooltip>
        <PopoverContent
          side="top"
          align="center"
          aria-label="リアクションを選ぶ"
          className="flex w-max items-center justify-center gap-1 rounded-[14px] border-border bg-background p-1 shadow-lg shadow-black/5"
        >
          {SHARING_REACTION_KINDS.map((kind) => {
            const option = SHARING_REACTION_OPTIONS[kind];
            return (
              <Tooltip key={kind}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={option.sendLabel}
                    aria-disabled={disabled}
                    className="aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
                    onClick={() => {
                      if (!disabled) onSendReaction(kind);
                    }}
                  >
                    <Image
                      src={option.imageSrc}
                      alt=""
                      width={28}
                      height={28}
                      loading="eager"
                      draggable={false}
                      className="h-auto w-7 max-w-none shrink-0"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  onEscapeKeyDown={() => setOpen(false)}
                >
                  {option.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
