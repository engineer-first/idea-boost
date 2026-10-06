"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClientMessage,
  type ProtocolMember,
  RoomDisplayNameSchema,
  type ServerMessage,
} from "@/contracts/room-protocol";

export type RoomDisplayNameControls = {
  open: boolean;
  draft: string;
  pending: boolean;
  error: string | null;
  disabled: boolean;
  request: () => void;
  onDraftChange: (name: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onClosed?: () => void;
};
type Options = {
  currentUserId: string;
  members: ProtocolMember[];
  connected: boolean;
  blocked: boolean;
  send: (message: ClientMessage) => boolean;
};
export function useRoomDisplayName({
  currentUserId,
  members,
  connected,
  blocked,
  send,
}: Options): RoomDisplayNameControls & {
  applyMessage: (message: ServerMessage) => boolean;
} {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const operationRef = useRef<{ id: string; name: string } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback((reason: string | null = null) => {
    operationRef.current = null;
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setPending(false);
    setError(reason);
  }, []);
  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!connected && operationRef.current)
      finish(
        "接続が切れました。再接続後に保存済みの呼び名を確認して、もう一度お試しください。",
      );
  }, [connected, finish]);
  const member = members.find((m) => m.userId === currentUserId);
  const disabled = !connected || blocked || !member;
  const request = () => {
    if (disabled || operationRef.current) return;
    const active =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    triggerRef.current = active?.closest("[data-radix-popper-content-wrapper]")
      ? document.querySelector<HTMLElement>(
          '[data-host-transfer-origin][data-state="open"], [data-testid="room-menu-trigger"][data-state="open"]',
        )
      : active;
    setDraft(member?.name ?? "");
    setError(null);
    setOpen(true);
  };
  const onConfirm = () => {
    if (disabled || operationRef.current) return;
    const parsed = RoomDisplayNameSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const operation = { id: crypto.randomUUID(), name: parsed.data };
    operationRef.current = operation;
    setPending(true);
    setError(null);
    if (
      !send({
        type: "member:rename",
        name: operation.name,
        operationId: operation.id,
      })
    ) {
      finish("送信できませんでした。接続を確認して、もう一度お試しください。");
      return;
    }
    // フェイクWS等の同期応答も尊重し、成功後にタイマーを残さない。
    if (operationRef.current === operation)
      timeoutRef.current = setTimeout(
        () =>
          finish(
            "保存結果を確認できませんでした。保存済みの呼び名を確認して、もう一度お試しください。",
          ),
        10000,
      );
  };
  const applyMessage = (message: ServerMessage): boolean => {
    if (
      message.type === "member:renamed" &&
      message.member.userId === currentUserId &&
      message.operationId === operationRef.current?.id
    ) {
      finish();
      setOpen(false);
    }
    if (
      message.type === "snapshot" &&
      operationRef.current &&
      message.members.some(
        (m) =>
          m.userId === currentUserId && m.name === operationRef.current?.name,
      )
    ) {
      finish();
      setOpen(false);
    }
    if (
      message.type === "error" &&
      message.operationId &&
      message.operationId === operationRef.current?.id
    ) {
      finish(message.message);
      return true;
    }
    return false;
  };
  return {
    open,
    draft,
    pending,
    error,
    disabled,
    request,
    onDraftChange: (value) => {
      setDraft(value);
      setError(null);
    },
    onOpenChange: (value) => {
      if (!operationRef.current) {
        setOpen(value);
        if (!value) setError(null);
      }
    },
    onConfirm,
    applyMessage,
    onClosed: () => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    },
  };
}
