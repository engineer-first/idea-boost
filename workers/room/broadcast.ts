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
import {
  WS_CLOSE_AUTH_REQUIRED,
  WS_CLOSE_AUTH_REQUIRED_REASON,
} from "../../contracts/room-protocol";
import { SessionExpiresAtSchema } from "../../contracts/session";
import { visibleTo } from "../visibility";

// WS 接続ごとに serializeAttachment で永続化する状態。
// ハイバネーション復帰後も deserializeAttachment で取り出せる。
export type SocketAttachment = {
  userId: string;
  sessionExpiresAt?: number;
  moveConnectionId?: string;
  activeMoveOperationId?: string;
  movePreviewSequence?: number;
  hasCursor?: boolean;
  adoptionFocusNoteId?: string;
  // ハイバネーション後も排他ドラッグ権を復元できるよう接続へ保存する。
  activeDrag?: { noteId: string; dragId: string; leaseUntil?: number };
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
    private readonly onExpired?: (socket: WebSocket) => void,
  ) {}

  // transactionの確定前検査は副作用を起こさず、rollback後にauthorizeで閉じる。
  isAuthorized(socket: WebSocket): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    const expiry = SessionExpiresAtSchema.safeParse(
      attachment?.sessionExpiresAt,
    );
    return expiry.success && expiry.data > Math.floor(Date.now() / 1000);
  }

  // HTTPのJWT判定と同じ秒単位で、等値も拒否する。旧attachmentも拒否する。
  authorize(socket: WebSocket): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    if (this.isAuthorized(socket)) return true;
    socket.close(WS_CLOSE_AUTH_REQUIRED, WS_CLOSE_AUTH_REQUIRED_REASON);
    this.onExpired?.(socket);
    return false;
  }

  retireMovePresence(
    isActive: (attachment: SocketAttachment) => boolean,
    isMember: (viewerId: string) => boolean,
  ): number {
    let retired = 0;
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.activeMoveOperationId || isActive(attachment)) continue;
      const { activeMoveOperationId: _operationId, ...next } = attachment;
      socket.serializeAttachment(next);
      this.broadcastMoveEnded(_operationId, isMember);
      if (!this.hasOtherDragForUser(attachment.userId, socket))
        this.broadcastToAll({
          type: "cursor:drag-ended",
          userId: attachment.userId,
        });
      retired++;
    }
    return retired;
  }

  isConnected(userId: string): boolean {
    return this.connections
      .getWebSockets()
      .some(
        (socket) =>
          this.authorize(socket) &&
          (socket.deserializeAttachment() as SocketAttachment | null)
            ?.userId === userId,
      );
  }

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

  broadcastGroup(
    message: Extract<
      ServerMessage,
      { type: "group:updated" | "group:deleted" | "group:revision" }
    >,
    canView: (viewerId: string) => boolean,
  ): void {
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment && canView(attachment.userId))
        this.trySend(socket, JSON.stringify(message));
    }
  }

  // 終了には対象IDを含めない。非memberの旧接続へ新しい操作情報を送らない。
  broadcastMoveEnded(
    operationId: string,
    isMember: (viewerId: string) => boolean,
  ): void {
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment && isMember(attachment.userId))
        this.trySend(
          socket,
          JSON.stringify({
            type: "notes:move-ended",
            operationId,
          } satisfies ServerMessage),
        );
    }
  }

  broadcastMovePreview(
    message: Extract<ServerMessage, { type: "notes:move-preview" }>,
    subjects: ProtocolNote[],
    isMember: (viewerId: string) => boolean,
    except: WebSocket,
  ): void {
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (socket === except || !attachment || !isMember(attachment.userId))
        continue;
      if (
        !subjects.every((note) =>
          visibleTo({ viewerId: attachment.userId }, note),
        )
      )
        continue;
      this.trySend(socket, JSON.stringify(message));
    }
  }

  broadcastMoveBatch(
    buildMessage: (
      viewerId: string,
    ) => Extract<ServerMessage, { type: "notes:moved" }>,
  ): void {
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      const message = buildMessage(attachment.userId);
      if (
        !message.notes.every((note) =>
          visibleTo({ viewerId: attachment.userId }, note),
        )
      )
        continue;
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

  currentAdoptionFocusNoteId(): string | null {
    for (const socket of this.connections.getWebSockets()) {
      if (!this.authorize(socket)) continue;
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.adoptionFocusNoteId) {
        return attachment.adoptionFocusNoteId;
      }
    }
    return null;
  }

  setAdoptionFocus(socket: WebSocket, noteId: string | null): boolean {
    let changed = false;
    for (const candidate of this.connections.getWebSockets()) {
      const attachment =
        candidate.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      const nextNoteId =
        candidate === socket ? (noteId ?? undefined) : undefined;
      if (attachment.adoptionFocusNoteId === nextNoteId) continue;
      candidate.serializeAttachment({
        ...attachment,
        adoptionFocusNoteId: nextNoteId,
      } satisfies SocketAttachment);
      changed = true;
    }
    return changed;
  }

  retireAdoptionFocus(socket: WebSocket): boolean {
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.adoptionFocusNoteId) return false;
    socket.serializeAttachment({
      ...attachment,
      adoptionFocusNoteId: undefined,
    } satisfies SocketAttachment);
    return true;
  }

  retireAllAdoptionFocus(): boolean {
    let changed = false;
    for (const socket of this.connections.getWebSockets()) {
      changed = this.retireAdoptionFocus(socket) || changed;
    }
    return changed;
  }

  retireAdoptionFocusForNote(noteId: string): boolean {
    let changed = false;
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.adoptionFocusNoteId !== noteId) continue;
      socket.serializeAttachment({
        ...attachment,
        adoptionFocusNoteId: undefined,
      } satisfies SocketAttachment);
      changed = true;
    }
    return changed;
  }

  hasOtherPresenceForUser(userId: string, except: WebSocket): boolean {
    for (const socket of this.connections.getWebSockets()) {
      if (!this.authorize(socket)) continue;
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

  // cursorは本人単位で表示するため、別の有効接続のdragを旧接続の終了で消さない。
  hasOtherDragForUser(userId: string, except: WebSocket): boolean {
    return this.connections.getWebSockets().some((socket) => {
      if (socket === except || !this.authorize(socket)) return false;
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      return (
        attachment?.userId === userId &&
        Boolean(attachment.activeMoveOperationId || this.activeDragFor(socket))
      );
    });
  }

  findActiveDrag(noteId: string): ActiveDragOwner | null {
    for (const socket of this.connections.getWebSockets()) {
      if (!this.authorize(socket)) continue;
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (
        attachment?.activeDrag?.noteId !== noteId ||
        !this.activeDragFor(socket)
      )
        continue;
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
    if (!this.authorize(socket)) return null;
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.activeDrag) return null;
    if (attachment.activeDrag.leaseUntil === undefined) {
      attachment.activeDrag.leaseUntil = Date.now() + 15_000;
      socket.serializeAttachment(attachment);
    }
    if (attachment.activeDrag.leaseUntil <= Date.now()) {
      return null;
    }
    return {
      socket,
      attachment,
      ...attachment.activeDrag,
    };
  }

  expireActiveDrags(now = Date.now()): ActiveDragOwner[] {
    const expired: ActiveDragOwner[] = [];
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      const active = attachment?.activeDrag;
      if (
        !attachment ||
        !active ||
        active.leaseUntil === undefined ||
        active.leaseUntil > now
      )
        continue;
      expired.push({
        socket,
        attachment,
        noteId: active.noteId,
        dragId: active.dragId,
      });
      socket.serializeAttachment({ ...attachment, activeDrag: undefined });
    }
    return expired;
  }

  hasActiveDrag(): boolean {
    return this.connections.getWebSockets().some((socket) => {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      return Boolean(attachment?.activeDrag && this.activeDragFor(socket));
    });
  }

  retireActiveDrag(socket: WebSocket): ActiveDragOwner | null {
    const active = this.activeDragFor(socket);
    if (!active) return null;
    socket.serializeAttachment({
      ...active.attachment,
      activeDrag: undefined,
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
    if (!this.authorize(ws)) return;
    try {
      ws.send(payload);
    } catch {
      // 切断済み等はスキップ
    }
  }
}
