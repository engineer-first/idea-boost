"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TimerSoundControls } from "../logic/use-room-timer-sounds";

export function TimerSoundControl({
  enabled,
  playbackBlocked,
  onEnable,
  onMute,
}: TimerSoundControls) {
  const errorId = useId();
  const playbackMessage =
    "通知音を再生できません。この端末の通知音ボタンを押して再試行してください。";
  const title = playbackBlocked
    ? "通知音を再生できません。押して再試行（この端末のみ）"
    : `通知音: ${enabled ? "ON" : "OFF"}（この端末のみ）`;

  return (
    <TooltipProvider>
      <Tooltip open={playbackBlocked}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            data-testid="timer-sound-toggle"
            aria-label="タイマー通知音"
            aria-pressed={enabled}
            aria-describedby={playbackBlocked ? errorId : undefined}
            title={title}
            variant="outline"
            size="icon"
            className="board-hud absolute top-1/2 right-1 z-10 size-8 -translate-y-1/2 p-0 transition-none active:not-aria-[haspopup]:-translate-y-1/2"
            onClick={() => {
              if (enabled) {
                onMute();
              } else {
                void onEnable();
              }
            }}
          >
            {enabled ? (
              <Volume2 aria-hidden="true" />
            ) : (
              <VolumeX aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          aria-label={playbackMessage}
          side="bottom"
          align="end"
          collisionPadding={8}
          className="board-hud w-64 max-w-[calc(100vw-2rem)] border bg-background p-3 text-sm leading-relaxed text-foreground shadow-sm data-[state=closed]:animate-none data-[state=delayed-open]:animate-none"
        >
          <p id={errorId} role="status">
            {playbackMessage}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
