"use client";

// RoomDO への WebSocket 接続配線の hook。ロビーとボードの両方で使う。
// - 接続の生成・破棄と表示用の接続状態
// - 退出（ended）/ 解散（disbanded）による意図的切断: 再接続せずホームへ戻す
// - onMessage は最新のハンドラへ届ける（ハンドラ差し替えで再接続しない）
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CompletedRoomSchema } from "@/contracts/completed-rooms";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import {
  createRoomClient,
  type RoomClient,
  type RoomSocketFactory,
} from "@/lib/room-client/room-client";
import { roomWebSocketUrl } from "@/lib/room-client/ws-url";
import type { RoomScreenConnectionStatus } from "./connection-status";
import { roomNotify } from "./room-notify";

const COMPLETION_REQUEST_TIMEOUT_MS = 10_000;

export type UseRoomConnectionOptions = {
  roomId: string;
  onMessage: (message: ServerMessage) => void;
  // テストからフェイク WebSocket を注入するための口。本番では未指定。
  webSocketFactory?: RoomSocketFactory;
  // 自分の退出操作による切断では roomDisbanded 通知を出さない（二重 toast 防止）。
  isLeavingRef?: React.RefObject<boolean>;
};

export type UseRoomConnectionResult = {
  connectionStatus: RoomScreenConnectionStatus;
  send: (message: ClientMessage) => boolean;
};

export function useRoomConnection({
  roomId,
  onMessage,
  webSocketFactory,
  isLeavingRef,
}: UseRoomConnectionOptions): UseRoomConnectionResult {
  const router = useRouter();
  // createRoomClient が生成直後に "connecting" を通知するので初期値と一致する。
  const [connectionStatus, setConnectionStatus] =
    useState<RoomScreenConnectionStatus>("connecting");
  const clientRef = useRef<RoomClient | null>(null);
  // ハンドラの差し替えを再接続にしないため、常に最新の onMessage を参照する。
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    let completionRequest: {
      controller: AbortController;
      timeout: ReturnType<typeof setTimeout>;
    } | null = null;
    function cancelCompletionRequest(): void {
      if (!completionRequest) return;
      clearTimeout(completionRequest.timeout);
      completionRequest.controller.abort();
      completionRequest = null;
    }
    async function recoverCompletedRoom(): Promise<void> {
      if (completionRequest || isLeavingRef?.current) return;
      const request = new AbortController();
      const timeout = setTimeout(
        cancelCompletionRequest,
        COMPLETION_REQUEST_TIMEOUT_MS,
      );
      completionRequest = { controller: request, timeout };
      try {
        const response = await fetch(
          `/api/completed-rooms/${encodeURIComponent(roomId)}`,
          {
            cache: "no-store",
            signal: request.signal,
          },
        );
        if (!response.ok) return;
        const completed = CompletedRoomSchema.safeParse(await response.json());
        if (
          request.signal.aborted ||
          !completed.success ||
          completed.data.roomId !== roomId ||
          isLeavingRef?.current
        )
          return;
        client.close();
        router.replace(`/completed-rooms/${encodeURIComponent(roomId)}`);
      } catch {
        // オフラインや一時障害では通常のWS再接続を続け、次の失敗時に再確認する。
      } finally {
        clearTimeout(timeout);
        if (completionRequest?.controller === request) completionRequest = null;
      }
    }
    const client = createRoomClient({
      url: roomWebSocketUrl(roomId),
      onMessage: (message) => onMessageRef.current(message),
      onStatusChange: (status) => {
        if (status === "open" || status === "ended" || status === "disbanded")
          cancelCompletionRequest();
        // 完了時に切断中だった在籍者にも、通知の受信に依存しない復帰経路を持つ。
        if (status === "closed") void recoverCompletedRoom();
        // 退出・解散による意図的切断: 再接続せずホームへ戻す。
        if (status === "ended" || status === "disbanded") {
          // 他メンバーが解散されたときだけここで理由を出す。
          // 自分の操作による通知は useLeaveRoom 成功時に出す（二重 toast 防止）。
          if (status === "disbanded" && !isLeavingRef?.current) {
            roomNotify.roomDisbanded();
          }
          router.replace("/home");
          return;
        }
        setConnectionStatus(status);
      },
      webSocketFactory,
    });
    clientRef.current = client;
    return () => {
      cancelCompletionRequest();
      clientRef.current = null;
      client.close();
    };
  }, [roomId, webSocketFactory, router, isLeavingRef]);

  const send = useCallback((message: ClientMessage) => {
    return clientRef.current?.send(message) ?? false;
  }, []);

  return { connectionStatus, send };
}
