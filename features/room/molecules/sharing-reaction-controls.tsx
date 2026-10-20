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

export type SharingReactionControlsProps = {
  disabled: boolean;
  onSendLike: () => void;
};

export function SharingReactionControls({
  disabled,
  onSendLike,
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
          className="flex min-w-24 items-center justify-center rounded-xl border-border bg-background p-1 shadow-lg shadow-black/5"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="いいねを送る"
                disabled={disabled}
                onClick={onSendLike}
              >
                <Image
                  src="/reactions/like-3d.png"
                  alt=""
                  width={28}
                  height={28}
                  loading="eager"
                  draggable={false}
                  className="h-auto w-7 max-w-none shrink-0"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" onEscapeKeyDown={() => setOpen(false)}>
              いいね
            </TooltipContent>
          </Tooltip>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
