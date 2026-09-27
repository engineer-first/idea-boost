// ルーム WebSocket クライアント。フレームワーク非依存の純粋なロジックで、
// React からは room-board.tsx（コンテナ）が useEffect で生成・破棄する。
//
// 再接続の考え方: 予期しない切断では指数バックオフで再接続する。
// 再接続後はサーバー（RoomDO）が snapshot を送ってくるため、クライアント側で
// 差分の取りこぼしを追跡する必要がない（復帰パスをサーバーの契約にしている）。
// 退出・解散による close は再接続せず ended / disbanded を通知する。
import {
  type ClientMessage,
  parseServerMessage,
  type ServerMessage,
  WS_CLOSE_LEFT_ROOM,
  WS_CLOSE_LEFT_ROOM_REASON,
  WS_CLOSE_ROOM_DISBANDED,
  WS_CLOSE_ROOM_DISBANDED_REASON,
} from "@/contracts/room-protocol";

const WEBSOCKET_OPEN = 1;

// 1s → 2s → 4s → 8s、以降は 8s ごと。
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
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    const ws = factory(options.url);
    socket = ws;
    options.onStatusChange?.("connecting");

    ws.addEventListener("open", () => {
      if (closedByUser || socket !== ws) return;
      reconnectAttempt = 0;
      options.onStatusChange?.("open");
    });

    ws.addEventListener("message", (event) => {
      if (closedByUser || socket !== ws) return;
      const message = parseServerMessage(event.data);
      if (!message) {
        console.warn(
          "解釈できないサーバーメッセージを無視しました:",
          event.data,
        );
        return;
      }
      options.onMessage(message);
    });

    ws.addEventListener("close", (event) => {
      if (closedByUser || socket !== ws) {
        return;
      }
      // 解散: 再接続せず disbanded（UI が理由を出してホームへ）
      if (isDisbandedClose(event)) {
        closedByUser = true;
        options.onStatusChange?.("disbanded");
        return;
      }
      // 個人退出: 再接続せず ended
      if (isLeftRoomClose(event)) {
        closedByUser = true;
        options.onStatusChange?.("ended");
        return;
      }
      options.onStatusChange?.("closed");
      scheduleReconnect();
    });
  }

  function scheduleReconnect(): void {
    const delay = delays[Math.min(reconnectAttempt, delays.length - 1)] ?? 1000;
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  connect();

  return {
    send(message: ClientMessage): boolean {
      if (!socket || socket.readyState !== WEBSOCKET_OPEN) {
        console.warn("接続確立前のメッセージ送信を破棄しました:", message.type);
        return false;
      }
      try {
        socket.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    },
    close(): void {
      closedByUser = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
    },
  };
}
