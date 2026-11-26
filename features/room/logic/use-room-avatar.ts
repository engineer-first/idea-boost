"use client";

import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
  const t = useTranslations("app.lobbyMembers");
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
      finish(connected ? null : t("avatarConnectionLost"));
  }, [connected, blocked, finish, t]);
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
        finish(t("avatarSendFailed"));
        return;
      }
      if (operation.current === operationId)
        timeout.current = setTimeout(
          () => finish(t("avatarResultUnknown")),
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
        finish(locale === "en" ? t("avatarGenericError") : message.message);
        return true;
      }
      return false;
    },
  };
}
