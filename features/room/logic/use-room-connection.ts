"use client";

// RoomDO への WebSocket 接続配線の hook。ロビーとボードの両方で使う。
// - 接続の生成・破棄と表示用の接続状態
// - 退出（ended）/ 解散（disbanded）による意図的切断: 再接続せずホームへ戻す
// - onMessage は最新のハンドラへ届ける（ハンドラ差し替えで再接続しない）
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import {
  createRoomClient,
  type RoomClient,
  type RoomSocketFactory,
} from "@/lib/room-client/room-client";
import { roomWebSocketUrl } from "@/lib/room-client/ws-url";
import type { RoomScreenConnectionStatus } from "./connection-status";
import { roomNotify } from "./room-notify";

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
    const client = createRoomClient({
      url: roomWebSocketUrl(roomId),
      onMessage: (message) => onMessageRef.current(message),
      onStatusChange: (status) => {
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
      clientRef.current = null;
      client.close();
    };
  }, [roomId, webSocketFactory, router, isLeavingRef]);

  const send = useCallback((message: ClientMessage) => {
    return clientRef.current?.send(message) ?? false;
  }, []);

  return { connectionStatus, send };
}
