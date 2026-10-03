"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";

export function useHostTransfer({
  isHost,
  hostRevision,
  connected,
  blocked,
  send,
}: {
  isHost: boolean;
  hostRevision: number | null;
  connected: boolean;
  blocked: boolean;
  send: (message: ClientMessage) => boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback((message: string | null = null) => {
    operationRef.current = null;
    setPending(false);
    setError(message);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);
  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!connected && operationRef.current !== null)
      finish("接続が切れました。再接続後に現在のホストを確認してください。");
  }, [connected, finish]);

  const transfer = useCallback(
    (targetUserId: string) => {
      if (
        !isHost ||
        hostRevision === null ||
        !connected ||
        blocked ||
        operationRef.current !== null
      )
        return;
      const operationId = crypto.randomUUID();
      operationRef.current = operationId;
      setPending(true);
      setError(null);
      if (
        !send({
          type: "host:transfer",
          targetUserId,
          expectedHostRevision: hostRevision,
          operationId,
        })
      ) {
        finish(
          "送信できませんでした。接続を確認してから操作し直してください。",
        );
        return;
      }
      // 同期応答を返すテスト用socketにも対応し、完了後のtimeoutを残さない。
      if (operationRef.current === operationId)
        timeoutRef.current = setTimeout(
          () =>
            finish(
              "結果を確認できませんでした。接続を確認してから操作し直してください。",
            ),
          5000,
        );
    },
    [isHost, hostRevision, connected, blocked, send, finish],
  );

  const applyMessage = useCallback(
    (message: ServerMessage): boolean => {
      if (
        message.type === "snapshot" ||
        (message.type === "host:updated" &&
          message.hostRevision >= (hostRevision ?? 0)) ||
        message.type === "outcome:published"
      ) {
        finish();
      } else if (
        message.type === "error" &&
        operationRef.current !== null &&
        message.operationId === operationRef.current
      ) {
        finish(message.message);
        return true;
      }
      return false;
    },
    [finish, hostRevision],
  );
  const isPending = useCallback(() => operationRef.current !== null, []);
  return {
    pending,
    error,
    transfer,
    applyMessage,
    isPending,
  };
}
