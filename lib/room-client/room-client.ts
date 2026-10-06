// ルーム WebSocket クライアント。フレームワーク非依存の純粋なロジックで、
// React からは room-board.tsx（コンテナ）が useEffect で生成・破棄する。
//
// 再接続の考え方: 予期しない切断では指数バックオフで再接続する。
// 再接続後はサーバー（RoomDO）が snapshot を送ってくるため、クライアント側で
// 差分の取りこぼしを追跡する必要がない（復帰パスをサーバーの契約にしている）。
// 退出・解散による close は再接続せず ended / disbanded を通知する。
import {
  type ClientMessage,
  needsHostRevision,
  parseServerMessage,
  type ServerMessage,
  WS_CLOSE_LEFT_ROOM,
  WS_CLOSE_LEFT_ROOM_REASON,
  WS_CLOSE_ROOM_DISBANDED,
  WS_CLOSE_ROOM_DISBANDED_REASON,
} from "@/contracts/room-protocol";

const WEBSOCKET_OPEN = 1;

// 指数バックオフの上限。各試行を上限の50〜100%に分散する。
const DEFAULT_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000];

export type RoomSocketFactory = (url: string) => WebSocket;

// UI が接続状態を表示するための状態。
// - connecting / open: 通常
// - closed: 予期しない切断（再接続待ち）
// - ended: 個人の退出など（再接続しない・ホームへ）
// - disbanded: ホストがルームを解散（再接続しない・理由通知してホームへ）
// close() によるクライアント主導の終了では通知しない。
export type RoomConnectionStatus =
  | "connecting"
  | "open"
  | "closed"
  | "ended"
  | "disbanded";

export type RoomClientOptions = {
  url: string;
  onMessage: (message: ServerMessage) => void;
  onStatusChange?: (status: RoomConnectionStatus) => void;
  webSocketFactory?: RoomSocketFactory;
  reconnectDelaysMs?: number[];
  random?: () => number;
};

export type RoomClient = {
  send(message: ClientMessage): boolean;
  close(): void;
};

function isLeftRoomClose(event: { code?: number; reason?: string }): boolean {
  return (
    event.code === WS_CLOSE_LEFT_ROOM ||
    event.reason === WS_CLOSE_LEFT_ROOM_REASON
  );
}

function isDisbandedClose(event: { code?: number; reason?: string }): boolean {
  return (
    event.code === WS_CLOSE_ROOM_DISBANDED ||
    event.reason === WS_CLOSE_ROOM_DISBANDED_REASON
  );
}

export function createRoomClient(options: RoomClientOptions): RoomClient {
  const factory: RoomSocketFactory =
    options.webSocketFactory ?? ((url) => new WebSocket(url));
  const delays = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;

  let socket: WebSocket | null = null;
  let closedByUser = false;
  let hostRevision: number | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  let detachSocket: (() => void) | null = null;
  const online = (): boolean =>
    typeof navigator === "undefined" || navigator.onLine;
  function clearReconnect(): void {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  function disposeSocket(): void {
    detachSocket?.();
    detachSocket = null;
    const previous = socket;
    socket = null;
    previous?.close();
  }
  function stop(): void {
    closedByUser = true;
    clearReconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    }
    disposeSocket();
  }
  function handleOffline(): void {
    if (closedByUser) return;
    clearReconnect();
    disposeSocket();
    options.onStatusChange?.("closed");
  }
  function handleOnline(): void {
    if (closedByUser || !online() || (socket && socket.readyState < 2)) return;
    clearReconnect();
    connect();
  }
  function connect(): void {
    if (closedByUser || !online()) return;
    disposeSocket();
    const ws = factory(options.url);
    socket = ws;
    options.onStatusChange?.("connecting");

    const onOpen = (): void => {
      if (closedByUser || socket !== ws) return;
      reconnectAttempt = 0;
      options.onStatusChange?.("open");
    };

    const onMessage = (event: MessageEvent): void => {
      if (closedByUser || socket !== ws) return;
      const message = parseServerMessage(event.data);
      if (!message) {
        console.warn(
          "解釈できないサーバーメッセージを無視しました:",
          event.data,
        );
        return;
      }
      if (
        (message.type === "snapshot" || message.type === "host:updated") &&
        message.hostRevision !== undefined
      )
        hostRevision = Math.max(hostRevision ?? 0, message.hostRevision);
      options.onMessage(message);
    };

    const onClose = (event: CloseEvent): void => {
      if (closedByUser || socket !== ws) {
        return;
      }
      // 解散: 再接続せず disbanded（UI が理由を出してホームへ）
      if (isDisbandedClose(event)) {
        stop();
        options.onStatusChange?.("disbanded");
        return;
      }
      // 個人退出: 再接続せず ended
      if (isLeftRoomClose(event)) {
        stop();
        options.onStatusChange?.("ended");
        return;
      }
      options.onStatusChange?.("closed");
      scheduleReconnect();
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    detachSocket = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
    };
  }

  function scheduleReconnect(): void {
    if (closedByUser || !online() || reconnectTimer !== null) return;
    const ceiling =
      delays[Math.min(reconnectAttempt, delays.length - 1)] ?? 1000;
    const random = Math.min(1, Math.max(0, (options.random ?? Math.random)()));
    const delay = Math.round(ceiling * (0.5 + random * 0.5));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  if (typeof window !== "undefined") {
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
  }
  if (online()) connect();
  else options.onStatusChange?.("closed");

  return {
    send(message: ClientMessage): boolean {
      if (!socket || socket.readyState !== WEBSOCKET_OPEN) {
        console.warn("接続確立前のメッセージ送信を破棄しました:", message.type);
        return false;
      }
      try {
        const request =
          needsHostRevision(message) &&
          message.expectedHostRevision === undefined &&
          hostRevision !== null
            ? { ...message, expectedHostRevision: hostRevision }
            : message;
        socket.send(JSON.stringify(request));
        return true;
      } catch {
        return false;
      }
    },
    close(): void {
      stop();
    },
  };
}
