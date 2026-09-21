"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TimerSoundControls } from "../logic/use-room-timer-sounds";

export function TimerSoundControl({
  enabled,
  playbackBlocked,
  onEnable,
  onMute,
  onPreview,
}: TimerSoundControls) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          data-testid="timer-sound-settings"
          aria-label="通知音の設定"
          title={enabled ? "通知音: ON" : "通知音: OFF"}
          variant="outline"
          size="icon"
          className="board-hud absolute top-1/2 right-1 z-10 size-8 -translate-y-1/2 p-0"
        >
          {enabled ? (
            <Volume2 aria-hidden="true" />
          ) : (
            <VolumeX aria-hidden="true" />
          )}
          <span className="sr-only">音 {enabled ? "ON" : "OFF"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-testid="timer-sound-panel"
        aria-label="通知音の設定"
        align="end"
        className="board-hud w-72 bg-background"
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>
            通知音を使うと、タイマーの開始・残り5〜1秒・時間切れと、全員の投票完了を知らせます。
          </p>
          <p className="text-xs text-muted-foreground">この端末のみ</p>
          {playbackBlocked ? (
            <p role="alert" className="text-sm text-destructive">
              ブラウザが音声の再生を拒否しました。もう一度試すか、このサイトの音声再生設定を確認してください。
            </p>
          ) : null}
          {enabled ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => void onPreview()}
              >
                試聴
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1"
                onClick={onMute}
              >
                通知音を消音
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={() => void onEnable()}
            >
              {playbackBlocked ? "再試行して有効にする" : "通知音を有効にする"}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
