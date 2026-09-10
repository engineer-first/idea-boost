// ルーム内の全 WS 接続への配信を一手に引き受ける。
// - ノートに紐づく情報は必ず visibleTo（workers/visibility.ts）を通す（選択的送信）
// - メンバー参加・進行状態・タイマーのように参加者全員が受け取る情報は
//   broadcastToAll / broadcastToAllExcept という別経路で送る
// RoomDO はハイバネーションでメモリから消えるため、接続一覧を自前で保持せず、
// 送信のたびに getWebSockets() から取得する。
import type {
  ProtocolNote,
  ServerMessage,
} from "../../contracts/room-protocol";
import { visibleTo } from "../visibility";

// WS 接続ごとに serializeAttachment で永続化する状態。
// ハイバネーション復帰後も deserializeAttachment で取り出せる。
export type SocketAttachment = {
  userId: string;
  hasCursor?: boolean;
  // note:drag は永続化しないため、切断時の解除通知にだけ使う一時状態。
  activeDragNoteId?: string;
};

export class RoomBroadcaster {
  constructor(
    private readonly connections: Pick<DurableObjectState, "getWebSockets">,
  ) {}

  sendTo(ws: WebSocket, message: ServerMessage): void {
    this.trySend(ws, JSON.stringify(message));
  }

  // 受信者ごとに内容が変わるノートメッセージを、可視な相手にだけ送る。
  broadcastNote(
    buildMessage: (
      viewerId: string,
    ) => Extract<ServerMessage, { type: "note:inserted" | "note:updated" }>,
  ): void {
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      const message = buildMessage(attachment.userId);
      if (!visibleTo({ viewerId: attachment.userId }, message.note)) continue;
      this.trySend(socket, JSON.stringify(message));
    }
  }

  // 投票のように、特定ユーザーの状態だけを同期したい場合の配信。
  // 同一ユーザーの複数タブには反映しつつ、他者にはイベント自体を送らない。
  broadcastNoteToUser(
    userId: string,
    buildMessage: (
      viewerId: string,
    ) => Extract<ServerMessage, { type: "note:inserted" | "note:updated" }>,
  ): void {
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || attachment.userId !== userId) continue;
      const message = buildMessage(attachment.userId);
      if (!visibleTo({ viewerId: attachment.userId }, message.note)) continue;
      this.trySend(socket, JSON.stringify(message));
    }
  }

  // subject（ノート）が可視な相手にだけ同一メッセージを送る。
  broadcast(
    message: ServerMessage,
    subject: ProtocolNote,
    except?: WebSocket,
  ): void {
    const payload = JSON.stringify(message);
    for (const socket of this.connections.getWebSockets()) {
      if (socket === except) continue;
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      if (!visibleTo({ viewerId: attachment.userId }, subject)) continue;
      this.trySend(socket, payload);
    }
  }

  // ノート以外の共有情報（member / phase / timer / decision）を全員に送る。
  broadcastToAll(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const socket of this.connections.getWebSockets()) {
      this.trySend(socket, payload);
    }
  }

  broadcastToAllExcept(message: ServerMessage, exceptUserId: string): void {
    const payload = JSON.stringify(message);
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment || attachment.userId === exceptUserId) continue;
      this.trySend(socket, payload);
    }
  }

  hasOtherPresenceForUser(userId: string, except: WebSocket): boolean {
    for (const socket of this.connections.getWebSockets()) {
      if (socket === except) continue;
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (
        attachment?.userId === userId &&
        (attachment.hasCursor || attachment.activeDragNoteId)
      ) {
        return true;
      }
    }
    return false;
  }

  // 閉じかけのソケットで send が throw しても、他接続への配信を止めない。
  private trySend(ws: WebSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      // 切断済み等はスキップ
    }
  }
}
