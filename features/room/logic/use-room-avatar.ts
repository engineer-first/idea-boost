"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";

export type RoomAvatarControls = {
  pending: boolean;
  disabled: boolean;
  unavailable: boolean;
  error: string | null;
  randomize: () => void;
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
  const [availableCount, setAvailableCount] = useState<number | null>(null);
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
  const unavailable = availableCount === 0;
  const disabled =
    !connected || blocked || pending || availableCount === null || unavailable;
  return {
    pending,
    disabled,
    unavailable,
    error,
    randomize() {
      if (disabled || operation.current) return;
      const operationId = crypto.randomUUID();
      operation.current = operationId;
      setPending(true);
      setError(null);
      if (!send({ type: "member:randomize-avatar", operationId })) {
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
      if (message.type === "snapshot") {
        setAvailableCount(message.availableAvatarCount ?? null);
        finish();
      }
      if (
        message.type === "member_joined" ||
        message.type === "member:avatar-updated"
      ) {
        if (message.availableAvatarCount !== undefined)
          setAvailableCount(message.availableAvatarCount);
        if (
          message.type === "member:avatar-updated" &&
          message.operationId === operation.current
        )
          finish();
      }
      if (
        message.type === "error" &&
        operation.current &&
        message.operationId === operation.current
      ) {
        if (message.code === "avatar-unavailable") setAvailableCount(0);
        finish(message.message);
        return true;
      }
      return false;
    },
  };
}
