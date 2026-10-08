"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createFeedbackId,
  FeedbackInputSchema,
  type FeedbackKind,
  type SubmitFeedback,
} from "@/contracts/feedback";

export type FeedbackDraft = {
  target: string;
  kind: FeedbackKind | "";
  body: string;
  rating: number | null;
};
export type FeedbackControls = {
  draft: FeedbackDraft;
  isOpen: boolean;
  pending: boolean;
  retryWithNewId: boolean;
  error: string | null;
  receipt: string | null;
  promptVisible: boolean;
  open: (target: string, returnFocusTo?: HTMLElement | null) => void;
  close: () => void;
  change: (patch: Partial<FeedbackDraft>) => void;
  send: () => Promise<void>;
  schedulePrompt: () => void;
  cancelPrompt: () => void;
  dismissPrompt: () => void;
};
const empty = (): FeedbackDraft => ({
  target: "unknown",
  kind: "",
  body: "",
  rating: null,
});
export function useFeedback(
  roomId: string,
  submit: SubmitFeedback,
): FeedbackControls {
  const [retryWithNewId, setRetryWithNewId] = useState(false);
  const [draft, setDraft] = useState<FeedbackDraft>(empty);
  const [isOpen, setOpen] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null),
    [receipt, setReceipt] = useState<string | null>(null),
    [promptVisible, setPromptVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    shown = useRef(false),
    hasDraft = useRef(false),
    opened = useRef(false),
    sent = useRef(false),
    inFlight = useRef(false),
    generation = useRef(0);
  const request = useRef<{ fingerprint: string; id: string } | null>(null),
    trigger = useRef<HTMLElement | null>(null);
  const cancelPrompt = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setPromptVisible(false);
  }, []);
  useEffect(() => {
    generation.current++;
    setDraft(empty());
    setOpen(false);
    setPending(false);
    setRetryWithNewId(false);
    setError(null);
    setReceipt(null);
    setPromptVisible(false);
    hasDraft.current = false;
    opened.current = false;
    sent.current = false;
    inFlight.current = false;
    request.current = null;
    shown.current = false;
    try {
      shown.current =
        sessionStorage.getItem(`feedback-prompt:${roomId}`) === "shown";
    } catch {
      /* 保存不可時は表示中の1回に留める */
    }
    return () => {
      generation.current++;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [roomId]);
  const schedulePrompt = useCallback(() => {
    if (
      shown.current ||
      hasDraft.current ||
      opened.current ||
      sent.current ||
      timer.current !== null
    )
      return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (opened.current || hasDraft.current || sent.current || shown.current)
        return;
      shown.current = true;
      try {
        sessionStorage.setItem(`feedback-prompt:${roomId}`, "shown");
      } catch {
        /* 再読込を越えた保持はできない */
      }
      setPromptVisible(true);
    }, 500);
  }, [roomId]);
  const open = useCallback(
    (target: string, returnFocusTo?: HTMLElement | null): void => {
      cancelPrompt();
      if (!opened.current) {
        trigger.current =
          returnFocusTo ??
          (document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null);
      }
      if (!hasDraft.current) {
        setDraft({ ...empty(), target });
        setReceipt(null);
        setError(null);
      }
      opened.current = true;
      setOpen(true);
    },
    [cancelPrompt],
  );
  function close(): void {
    opened.current = false;
    setOpen(false);
    if (trigger.current?.isConnected) trigger.current.focus();
  }
  function change(patch: Partial<FeedbackDraft>): void {
    if (inFlight.current) return;
    hasDraft.current = true;
    setDraft((value) => ({
      ...value,
      ...patch,
      ...(patch.target && patch.target !== "app" ? { rating: null } : {}),
    }));
    setError(null);
    setRetryWithNewId(false);
  }
  async function send(): Promise<void> {
    if (inFlight.current) return;
    if (retryWithNewId) request.current = null;
    const fingerprint = JSON.stringify(draft);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: createFeedbackId() };
    const parsed = FeedbackInputSchema.safeParse({
      ...draft,
      id: request.current.id,
    });
    if (!parsed.success) {
      setError("対象・種類・2000文字以内の文章を確認してください。");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setRetryWithNewId(false);
    setError(null);
    const current = generation.current;
    try {
      const result = await submit(roomId, parsed.data);
      if (current !== generation.current) return;
      if (result.ok) {
        setReceipt(result.id);
        setDraft(empty());
        hasDraft.current = false;
        request.current = null;
        sent.current = true;
        cancelPrompt();
      } else {
        setError(result.error);
        setRetryWithNewId(result.retryWithNewId === true);
      }
    } catch {
      if (current === generation.current)
        setError(
          "送信できませんでした。入力は残っています。もう一度送信してください。",
        );
    } finally {
      if (current === generation.current) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }
  return {
    draft,
    isOpen,
    pending,
    retryWithNewId,
    error,
    receipt,
    promptVisible,
    open,
    close,
    change,
    send,
    schedulePrompt,
    cancelPrompt,
    dismissPrompt: cancelPrompt,
  };
}
