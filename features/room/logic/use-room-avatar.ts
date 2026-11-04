"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";

export type RoomAvatarControls = {
  pending: boolean;
  disabled: boolean;
  error: string | null;
  cycle: () => void;
};

export function useRoomAvatar({
  connected,
  blocked,
  send,
}: {
  connected: boolean;
  blocked: boolean;
  send: (message: ClientMessage) => boolean;
}): RoomAvatarControls & { applyMessage: (message: ServerMessage) => boolean } {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if ((!connected || blocked) && operation.current)
      finish(
        connected
          ? null
          : "接続が切れました。再接続後にアイコンを確認してください。",
      );
  }, [connected, blocked, finish]);
  const disabled = !connected || blocked || pending;
  return {
    pending,
    disabled,
    error,
    cycle() {
      if (disabled || operation.current) return;
      const operationId = crypto.randomUUID();
      operation.current = operationId;
      setPending(true);
      setError(null);
      if (!send({ type: "member:cycle-avatar", operationId })) {
        finish(
          "送信できませんでした。接続を確認して、もう一度お試しください。",
        );
        return;
      }
      if (operation.current === operationId)
        timeout.current = setTimeout(
          () =>
            finish(
              "結果を確認できませんでした。現在のアイコンを確認して、もう一度お試しください。",
            ),
          5000,
        );
    },
    applyMessage(message) {
      if (message.type === "snapshot") finish();
      if (
        message.type === "member:avatar-updated" &&
        message.operationId === operation.current
      )
        finish();
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
