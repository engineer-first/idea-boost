"use client";

import { CircleAlert, Volume2, VolumeX } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TimerSoundControls } from "../logic/use-room-timer-sounds";

export function TimerSoundControl({
  enabled,
  playbackBlocked,
  onEnable,
  onMute,
}: TimerSoundControls) {
  const errorId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLFieldSetElement>(null);
  const [noticeOpen, setNoticeOpen] = useState(playbackBlocked);
  const playbackMessage =
    "通知音を再生できません。音ボタンで再試行できます（この端末のみ）。";
  const title = playbackBlocked
    ? "通知音を再生できません。押して再試行（この端末のみ）"
    : `通知音: ${enabled ? "ON" : "OFF"}（この端末のみ）`;

  useEffect(() => {
    setNoticeOpen(playbackBlocked);
  }, [playbackBlocked]);

  useEffect(() => {
    const notice = noticeRef.current;
    if (!notice || !playbackBlocked || !noticeOpen) return;
    // top layerに表示しつつDOMはタイマー内に保ち、重なりと外側クリック消費を避ける。
    notice.showPopover?.();
    const position = () => {
      const toggle = toggleRef.current;
      if (!toggle) return;
      const bounds = toggle.getBoundingClientRect();
      notice.style.left = `${Math.min(
        Math.max(8, bounds.right - notice.offsetWidth),
        Math.max(8, window.innerWidth - notice.offsetWidth - 8),
      )}px`;
      notice.style.top = `${Math.min(
        bounds.bottom + 8,
        Math.max(8, window.innerHeight - notice.offsetHeight - 8),
      )}px`;
    };
    position();
    window.addEventListener("resize", position);
    return () => {
      notice.hidePopover?.();
      window.removeEventListener("resize", position);
    };
  }, [noticeOpen, playbackBlocked]);

  return (
    <>
      <Button
        ref={toggleRef}
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
            if (playbackBlocked) setNoticeOpen(true);
            void onEnable();
          }
        }}
      >
        {enabled ? (
          <Volume2 aria-hidden="true" />
        ) : (
          <VolumeX aria-hidden="true" />
        )}
        {playbackBlocked && (
          <CircleAlert
            aria-hidden="true"
            className="absolute -top-1 -right-1 size-3 rounded-full bg-background text-red-700"
          />
        )}
      </Button>
      {playbackBlocked && (
        <span id={errorId} role="status" className="sr-only">
          {playbackMessage}
        </span>
      )}
      <fieldset
        ref={noticeRef}
        popover="manual"
        hidden={!playbackBlocked || !noticeOpen}
        style={{ display: playbackBlocked && noticeOpen ? "block" : "none" }}
        aria-label="通知音の再生エラー"
        className="board-hud fixed inset-auto z-50 m-0 w-64 max-w-[calc(100vw-2rem)] space-y-2 rounded-md border bg-background p-3 text-sm leading-relaxed text-foreground shadow-sm"
      >
        <p>{playbackMessage}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setNoticeOpen(false);
            toggleRef.current?.focus();
          }}
        >
          案内を閉じる
        </Button>
      </fieldset>
    </>
  );
}
