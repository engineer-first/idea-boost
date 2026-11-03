"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  ProtocolMember,
  ServerMessage,
} from "@/contracts/room-protocol";

export type MemberRemovalControls = {
  open: boolean;
  target: ProtocolMember | null;
  pending: boolean;
  error: string | null;
  disconnected: boolean;
  blocked: boolean;
  request: (userId: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

type Options = {
  currentUserId: string;
  connected: boolean;
  blocked: boolean;
  members: ProtocolMember[];
  send: (message: ClientMessage) => boolean;
};

export function useMemberRemoval({
  currentUserId,
  connected,
  blocked,
  members,
  send,
}: Options): MemberRemovalControls & {
  applyMessage: (message: ServerMessage) => boolean;
  isPending: () => boolean;
} {
  const [selection, setSelection] = useState<{
    userId: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef<{ id: string; userId: string } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback((message: string | null = null) => {
    operationRef.current = null;
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setPending(false);
    setError(message);
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
        "接続が切れました。再接続後に参加者を確認して操作し直してください。",
      );
  }, [connected, finish]);
  const open = selection !== null;
  const target =
    members.find((member) => member.userId === selection?.userId) ?? null;
  const request = useCallback(
    (userId: string) => {
      if (
        !connected ||
        blocked ||
        operationRef.current ||
        userId === currentUserId ||
        !members.some((member) => member.userId === userId)
      )
        return;
      setError(null);
      setSelection({ userId });
    },
    [currentUserId, connected, blocked, members],
  );
  const onOpenChange = useCallback((value: boolean) => {
    if (!value && !operationRef.current) {
      setSelection(null);
      setError(null);
    }
  }, []);
  const onConfirm = useCallback(() => {
    if (!open || !target || !connected || blocked || operationRef.current)
      return;
    const operation = { id: crypto.randomUUID(), userId: target.userId };
    operationRef.current = operation;
    setPending(true);
    setError(null);
    if (
      !send({
        type: "member:remove",
        targetUserId: target.userId,
        operationId: operation.id,
      })
    ) {
      finish("送信できませんでした。接続を確認してから操作し直してください。");
      return;
    }
    if (operationRef.current === operation)
      timeoutRef.current = setTimeout(
        () =>
          finish(
            "結果を確認できませんでした。参加者一覧を確認してから操作し直してください。",
          ),
        5000,
      );
  }, [open, target, connected, blocked, send, finish]);
  const applyMessage = useCallback(
    (message: ServerMessage): boolean => {
      if (
        message.type === "member:removed" &&
        message.operationId === operationRef.current?.id &&
        message.targetUserId === operationRef.current.userId
      ) {
        finish();
        setSelection(null);
        return true;
      }
      if (
        message.type === "error" &&
        operationRef.current &&
        message.operationId === operationRef.current.id
      ) {
        finish(message.message);
        return true;
      }
      if (
        message.type === "member_left" &&
        message.userId === selection?.userId
      ) {
        finish();
        setSelection(null);
      }
      if (message.type === "outcome:published") {
        finish();
        setSelection(null);
      }
      if (
        message.type === "snapshot" &&
        selection &&
        !message.members?.some((member) => member.userId === selection.userId)
      ) {
        finish();
        setSelection(null);
      }
      return false;
    },
    [selection, finish],
  );
  const isPending = useCallback(() => operationRef.current !== null, []);
  return {
    open,
    target,
    pending,
    error,
    disconnected: !connected,
    blocked,
    request,
    onOpenChange,
    onConfirm,
    applyMessage,
    isPending,
  };
}
