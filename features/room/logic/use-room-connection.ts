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
  clearLastRoom,
  rememberLastRoom,
} from "@/lib/room-client/last-room-storage";
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
  currentUserId?: string;
  onMessage: (message: ServerMessage) => void;
  // テストからフェイク WebSocket を注入するための口。本番では未指定。
  webSocketFactory?: RoomSocketFactory;
  // 自分の退出操作による切断では roomDisbanded 通知を出さない（二重 toast 防止）。
  isLeavingRef?: React.RefObject<boolean>;
};

export type UseRoomConnectionResult = {
  connectionStatus: RoomScreenConnectionStatus;
  connectionDelayed: boolean;
  send: (message: ClientMessage) => boolean;
};

export function useRoomConnection({
  roomId,
  currentUserId,
  onMessage,
  webSocketFactory,
  isLeavingRef,
}: UseRoomConnectionOptions): UseRoomConnectionResult {
  const router = useRouter();
  // createRoomClient が生成直後に "connecting" を通知するので初期値と一致する。
  const [connectionStatus, setConnectionStatus] =
    useState<RoomScreenConnectionStatus>("connecting");
  const [connectionDelayed, setConnectionDelayed] = useState(false);
  const synchronizedRef = useRef(false);
  const clientRef = useRef<RoomClient | null>(null);
  // ハンドラの差し替えを再接続にしないため、常に最新の onMessage を参照する。
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    synchronizedRef.current = false;
    setConnectionStatus("connecting");
    setConnectionDelayed(false);
    let active = true;
    // snapshotで同期を確定するたびに照会世代を進める。socket openだけでは
    // 復旧していないため、切断中に始めた照会をまだ有効として扱う。
    let generation = 0;
    let terminal = false;
    let client: RoomClient | undefined;
    let delayedTimer: ReturnType<typeof setTimeout> | null = null;
    function stopDelay(): void {
      if (delayedTimer !== null) clearTimeout(delayedTimer);
      delayedTimer = null;
      setConnectionDelayed(false);
    }
    function startDelay(): void {
      if (delayedTimer !== null) return;
      delayedTimer = setTimeout(() => setConnectionDelayed(true), 10_000);
    }
    startDelay();
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
      if (
        completionRequest ||
        terminal ||
        !active ||
        isLeavingRef?.current ||
        !navigator.onLine
      )
        return;
      const requestGeneration = generation;
      const request = new AbortController();
      const timeout = setTimeout(
        cancelCompletionRequest,
        COMPLETION_REQUEST_TIMEOUT_MS,
      );
      completionRequest = { controller: request, timeout };
      const current = (): boolean =>
        active &&
        !terminal &&
        !request.signal.aborted &&
        generation === requestGeneration &&
        !isLeavingRef?.current;
      function finish(status: "auth-required" | "unavailable"): void {
        if (!current()) return;
        terminal = true;
        generation += 1;
        synchronizedRef.current = false;
        stopDelay();
        cancelCompletionRequest();
        client?.close();
        setConnectionStatus(status);
        if (status === "unavailable") clearLastRoom(roomId);
      }
      try {
        const response = await fetch(
          `/api/completed-rooms/${encodeURIComponent(roomId)}`,
          {
            cache: "no-store",
            signal: request.signal,
          },
        );
        if (!current()) return;
        if (response.status === 401) {
          finish("auth-required");
          return;
        }
        if (response.status === 404) {
          const roomResponse = await fetch(
            `/api/rooms/${encodeURIComponent(roomId)}`,
            { cache: "no-store", signal: request.signal },
          );
          if (!current()) return;
          if (roomResponse.status === 401) finish("auth-required");
          else if (roomResponse.status === 404) finish("unavailable");
          return;
        }
        if (!response.ok) return;
        const completed = CompletedRoomSchema.safeParse(await response.json());
        if (
          !current() ||
          !completed.success ||
          completed.data.roomId !== roomId ||
          isLeavingRef?.current
        )
          return;
        stopDelay();
        terminal = true;
        generation += 1;
        synchronizedRef.current = false;
        cancelCompletionRequest();
        client?.close();
        router.replace(`/completed-rooms/${encodeURIComponent(roomId)}`);
      } catch {
        // オフラインや一時障害では通常のWS再接続を続け、次の失敗時に再確認する。
      } finally {
        clearTimeout(timeout);
        if (completionRequest?.controller === request) completionRequest = null;
      }
    }
    client = createRoomClient({
      url: roomWebSocketUrl(roomId),
      onMessage: (message) => {
        if (!active || terminal) return;
        if (message.type === "snapshot") {
          generation += 1;
          cancelCompletionRequest();
        }
        onMessageRef.current(message);
        if (message.type === "snapshot") {
          synchronizedRef.current = true;
          stopDelay();
          setConnectionStatus("open");
          if (
            currentUserId &&
            message.members.some((member) => member.userId === currentUserId)
          )
            rememberLastRoom(currentUserId, roomId);
        }
      },
      onStatusChange: (status) => {
        if (!active || terminal) return;
        if (status === "ended" || status === "disbanded") {
          terminal = true;
          generation += 1;
          cancelCompletionRequest();
        }
        // 完了時に切断中だった在籍者にも、通知の受信に依存しない復帰経路を持つ。
        if (status === "closed") void recoverCompletedRoom();
        // 退出・解散による意図的切断: 再接続せずホームへ戻す。
        if (status === "ended" || status === "disbanded") {
          synchronizedRef.current = false;
          stopDelay();
          clearLastRoom(roomId);
          // 他メンバーが解散されたときだけここで理由を出す。
          // 自分の操作による通知は useLeaveRoom 成功時に出す（二重 toast 防止）。
          if (status === "disbanded" && !isLeavingRef?.current) {
            roomNotify.roomDisbanded();
          }
          router.replace("/home");
          return;
        }
        synchronizedRef.current = false;
        startDelay();
        setConnectionStatus(status === "open" ? "connecting" : status);
      },
      webSocketFactory,
    });
    clientRef.current = client;
    const handleOffline = (): void => {
      generation += 1;
      cancelCompletionRequest();
    };
    window.addEventListener("offline", handleOffline);
    return () => {
      active = false;
      generation += 1;
      window.removeEventListener("offline", handleOffline);
      cancelCompletionRequest();
      if (delayedTimer !== null) clearTimeout(delayedTimer);
      synchronizedRef.current = false;
      clientRef.current = null;
      client.close();
    };
  }, [roomId, currentUserId, webSocketFactory, router, isLeavingRef]);

  const send = useCallback((message: ClientMessage) => {
    return (
      // 保存確認は読み取りのみ。snapshot適用中の既存本文回復でも必要。
      (synchronizedRef.current || message.type === "note:content-status") &&
      (clientRef.current?.send(message) ?? false)
    );
  }, []);

  return { connectionStatus, connectionDelayed, send };
}
