"use client";

import { useCallback, useEffect, useRef } from "react";

type ActiveMotion = {
  button: HTMLButtonElement;
  animation: Animation;
  pressed: boolean;
};

const rest = "translateY(0px) scale(1)";
const previewFrames: Keyframe[] = [
  { transform: rest },
  { transform: "translateY(-2px) scale(1.06)" },
  { transform: rest },
];
const pressFrames: Keyframe[] = [
  { transform: rest },
  { transform: "translateY(0px) scale(0.94)" },
  { transform: rest },
];

export function useSharingReactionMotion(disabled: boolean): {
  preview: (button: HTMLButtonElement, delayed?: boolean) => void;
  press: (button: HTMLButtonElement) => void;
  stop: (button?: HTMLButtonElement) => void;
} {
  const active = useRef<ActiveMotion | null>(null);
  const pending = useRef<{
    button: HTMLButtonElement;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const stop = useCallback((button?: HTMLButtonElement): void => {
    if (pending.current && (!button || pending.current.button === button)) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    if (active.current && (!button || active.current.button === button)) {
      active.current.animation.cancel();
      active.current = null;
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const handleChange = (): void => stop();
    media?.addEventListener("change", handleChange);
    return () => {
      media?.removeEventListener("change", handleChange);
      stop();
    };
  }, [stop]);

  useEffect(() => {
    if (!disabled) return;
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    // 受け付けた押下は最後まで戻す。待機への切替では選択演出だけを止める。
    if (active.current && !active.current.pressed) stop();
  }, [disabled, stop]);

  function play(button: HTMLButtonElement, pressed: boolean): void {
    stop();
    if (
      disabled ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const image = button.querySelector("img");
    if (!image?.animate) return;
    const animation = image.animate(pressed ? pressFrames : previewFrames, {
      duration: pressed ? 120 : 240,
      easing: "ease-out",
    });
    active.current = { button, animation, pressed };
    animation.onfinish = () => {
      if (active.current?.animation === animation) active.current = null;
    };
  }

  return {
    preview(button, delayed = false) {
      if (disabled || active.current?.pressed) return;
      stop();
      if (delayed) {
        pending.current = {
          button,
          timer: setTimeout(() => play(button, false), 80),
        };
      } else play(button, false);
    },
    press: (button) => play(button, true),
    stop,
  };
}
