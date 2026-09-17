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
  // ハイバネーション後も排他ドラッグ権を復元できるよう接続へ保存する。
  activeDrag?: { noteId: string; dragId: string };
  // 終了済み操作の遅延 start を同じ接続で再受理しない。接続寿命中は一度使った
  // dragId を全件保持し、古い ID の replay でも操作権を復活させない。
  retiredDragIds?: string[];
};

export type ActiveDragOwner = {
  socket: WebSocket;
  attachment: SocketAttachment;
  noteId: string;
  dragId: string;
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
        (attachment.hasCursor || attachment.activeDrag)
      ) {
        return true;
      }
    }
    return false;
  }

  findActiveDrag(noteId: string): ActiveDragOwner | null {
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.activeDrag?.noteId !== noteId) continue;
      return {
        socket,
        attachment,
        noteId,
        dragId: attachment.activeDrag.dragId,
      };
    }
    return null;
  }

  activeDragFor(socket: WebSocket): ActiveDragOwner | null {
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.activeDrag) return null;
    return {
      socket,
      attachment,
      ...attachment.activeDrag,
    };
  }

  isDragRetired(socket: WebSocket, dragId: string): boolean {
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    return attachment?.retiredDragIds?.includes(dragId) ?? false;
  }

  retireActiveDrag(socket: WebSocket): ActiveDragOwner | null {
    const active = this.activeDragFor(socket);
    if (!active) return null;
    const retiredDragIds = [
      ...(active.attachment.retiredDragIds ?? []).filter(
        (dragId) => dragId !== active.dragId,
      ),
      active.dragId,
    ];
    socket.serializeAttachment({
      ...active.attachment,
      activeDrag: undefined,
      retiredDragIds,
    } satisfies SocketAttachment);
    return active;
  }

  retireAllActiveDrags(): ActiveDragOwner[] {
    const retired: ActiveDragOwner[] = [];
    for (const socket of this.connections.getWebSockets()) {
      const active = this.retireActiveDrag(socket);
      if (active) retired.push(active);
    }
    return retired;
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
