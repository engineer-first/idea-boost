"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimerSoundControls } from "../logic/use-room-timer-sounds";

export function TimerSoundControl({
  enabled,
  playbackBlocked,
  onEnable,
  onMute,
}: TimerSoundControls) {
  const title = playbackBlocked
    ? "ブラウザが音声の再生を拒否しました。クリックして再試行"
    : `通知音: ${enabled ? "ON" : "OFF"}（この端末のみ）`;

  return (
    <Button
      type="button"
      data-testid="timer-sound-toggle"
      aria-label="タイマー通知音"
      aria-pressed={enabled}
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
  );
}
