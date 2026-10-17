"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomNameSchema } from "@/contracts/room-name";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";

export type RoomNameControls = {
  name: string | null;
  open: boolean;
  draft: string;
  pending: boolean;
  error: string | null;
  disabled: boolean;
  request: () => void;
  onDraftChange: (name: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onClosed: () => void;
};

type Options = {
  connected: boolean;
  blocked: boolean;
  send: (message: ClientMessage) => boolean;
};
export function useRoomName({
  connected,
  blocked,
  send,
}: Options): RoomNameControls & {
  applyMessage: (message: ServerMessage) => boolean;
} {
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const disabled = !connected || blocked || !ready;
  const finish = useCallback((message: string | null = null) => {
    operation.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setPending(false);
    setError(message);
  }, []);
  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  useEffect(() => {
    if (!connected && operation.current)
      finish(
        "接続が切れました。再接続後にルーム名を確認し、もう一度保存してください。",
      );
  }, [connected, finish]);
  return {
    name,
    open,
    draft,
    pending,
    error,
    disabled,
    request() {
      if (disabled || operation.current) return;
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      trigger.current = active?.closest("[data-radix-popper-content-wrapper]")
        ? document.querySelector<HTMLElement>(
            '[data-testid="room-menu-trigger"]',
          )
        : active;
      setDraft(name ?? "");
      setError(null);
      setOpen(true);
    },
    onDraftChange: setDraft,
    onOpenChange(value) {
      if (!value && !operation.current) {
        setOpen(false);
        setError(null);
      }
    },
    onConfirm() {
      if (!open || disabled || operation.current) return;
      const parsed = RoomNameSchema.safeParse(draft);
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      const id = crypto.randomUUID();
      operation.current = id;
      setPending(true);
      setError(null);
      if (!send({ type: "room:rename", name: parsed.data, operationId: id })) {
        finish(
          "送信できませんでした。接続を確認して、もう一度保存してください。",
        );
        return;
      }
      if (operation.current === id)
        timeout.current = setTimeout(
          () =>
            finish(
              "結果を確認できませんでした。現在のルーム名を確認して、もう一度保存してください。",
            ),
          5000,
        );
    },
    onClosed() {
      if (trigger.current?.isConnected) trigger.current.focus();
    },
    applyMessage(message) {
      if (message.type === "snapshot") {
        setName(message.roomName ?? null);
        setReady(message.roomName !== undefined);
      }
      if (message.type === "room:renamed") {
        setName(message.name);
        if (message.operationId === operation.current) {
          finish();
          setOpen(false);
        }
      }
      if (
        message.type === "error" &&
        operation.current &&
        message.operationId === operation.current
      ) {
        finish(message.message);
        return true;
      }
      return false;
    },
  };
}
