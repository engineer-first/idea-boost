// ルーム内の全 WS 接続への配信を一手に引き受ける。
// - ノートに紐づく情報は必ず visibleTo（workers/visibility.ts）を通す（選択的送信）
// - メンバー参加・進行状態・タイマーのように参加者全員が受け取る情報は
//   broadcastToAll / broadcastToAllExcept という別経路で送る
// RoomDO はハイバネーションでメモリから消えるため、接続一覧を自前で保持せず、
// 送信のたびに getWebSockets() から取得する。
import type {
  GroupDragFrame,
  ProtocolNote,
  ServerMessage,
} from "../../contracts/room-protocol";
import { visibleTo } from "../visibility";

// WS 接続ごとに serializeAttachment で永続化する状態。
// ハイバネーション復帰後も deserializeAttachment で取り出せる。
export type ActiveGroupDrag = {
  frame: GroupDragFrame;
  positions: { noteId: string; x: number; y: number }[];
  sequence: number;
  delta: { x: number; y: number };
  // 旧バージョンで開始済みの状態は期限なしとして読み、次のalarmで解放する。
  expiresAt?: number;
};

export type SocketAttachment = {
  userId: string;
  hasCursor?: boolean;
  adoptionFocusNoteId?: string;
  // ハイバネーション後も排他ドラッグ権を復元できるよう接続へ保存する。
  activeDrag?: { noteId: string; dragId: string; group?: true };
};

export type ActiveDragOwner = {
  socket: WebSocket;
  attachment: SocketAttachment;
  noteId: string;
  dragId: string;
  group?: ActiveGroupDrag;
};

export class RoomBroadcaster {
  constructor(
    private readonly connections: Pick<DurableObjectState, "getWebSockets">,
    private readonly sql?: SqlStorage,
  ) {}

  isConnected(userId: string): boolean {
    return this.connections
      .getWebSockets()
      .some(
        (socket) =>
          socket.readyState === WebSocket.OPEN &&
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

  /**
   * 一括更新も各受信者へ射影し、全対象の可視性を確認してから一度に送る。
   */
  broadcastGroupNotes(
    buildMessage: (viewerId: string) => Extract<
      ServerMessage,
      { type: "group:drag:updated" }
    > & {
      notes: ProtocolNote[];
    },
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

  /** 座標だけの途中通知も対象の可視性を確認し、同じpayloadを各接続で再利用する。 */
  broadcastGroupMovement(
    message: Extract<ServerMessage, { type: "group:drag:updated" }>,
    subjects: Pick<ProtocolNote, "visibility" | "authorId">[],
  ): void {
    const payload = JSON.stringify(message);
    for (const socket of this.connections.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (
        !attachment ||
        !subjects.every((note) =>
          visibleTo({ viewerId: attachment.userId }, note),
        )
      )
        continue;
      this.trySend(socket, payload);
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

  /** 付箋を操作中の接続を探し、グループ移動では代表以外の対象もロックとして扱う。 */
  findActiveDrag(noteId: string): ActiveDragOwner | null {
    for (const socket of this.connections.getWebSockets()) {
      const active = this.activeDragFor(socket);
      if (
        !active ||
        (active.noteId !== noteId &&
          !active.group?.positions.some(
            (position) => position.noteId === noteId,
          ))
      )
        continue;
      return {
        socket,
        attachment: active.attachment,
        noteId,
        dragId: active.dragId,
        group: active.group,
      };
    }
    return null;
  }

  /** 開始要求ごとに単独・一括移動のロックを1巡で集め、対象数に比例するSQL再読込を避ける。 */
  activeDraggedNoteIds(): Set<string> {
    const noteIds = new Set<string>();
    for (const socket of this.connections.getWebSockets()) {
      const active = this.activeDragFor(socket);
      if (!active) continue;
      noteIds.add(active.noteId);
      for (const position of active.group?.positions ?? [])
        noteIds.add(position.noteId);
    }
    return noteIds;
  }

  /** ソケット添付の操作IDから、必要に応じてSQLに保存されたグループ移動を復元する。 */
  activeDragFor(socket: WebSocket): ActiveDragOwner | null {
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.activeDrag) return null;
    return {
      socket,
      attachment,
      ...attachment.activeDrag,
      group: attachment.activeDrag.group
        ? this.readGroupDrag(attachment.activeDrag.dragId)
        : undefined,
    };
  }

  hasActiveDrag(): boolean {
    return this.connections.getWebSockets().some((socket) => {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      return Boolean(attachment?.activeDrag);
    });
  }

  /** 接続中のグループ移動があり、自動再編成を待つ必要があるか返す。 */
  hasActiveGroupDrag(): boolean {
    return this.connections.getWebSockets().some((socket) => {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      return Boolean(attachment?.activeDrag?.group);
    });
  }

  /** 各接続の操作IDに対応する、保存済みのグループ移動状態を列挙する。 */
  activeGroupDrags(): ActiveDragOwner[] {
    return this.connections.getWebSockets().flatMap((socket) => {
      const active = this.activeDragFor(socket);
      return active?.group ? [active] : [];
    });
  }

  /** 大量の付箋をソケット添付に含めず、操作IDに対応する移動状態をSQLへ保存する。 */
  saveGroupDrag(socket: WebSocket, group: ActiveGroupDrag): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment;
    const active = attachment.activeDrag;
    if (!this.sql || !active)
      throw new Error("一括ドラッグの保存先がありません。");
    this.sql.exec(
      "INSERT INTO active_group_drags (drag_id, state_json) VALUES (?1, ?2) ON CONFLICT(drag_id) DO UPDATE SET state_json = ?2",
      active.dragId,
      JSON.stringify(group),
    );
  }

  /** 操作IDに対応するグループ枠・開始位置・移動量・期限をSQLから読む。 */
  private readGroupDrag(dragId: string): ActiveGroupDrag | undefined {
    const row = this.sql
      ?.exec(
        "SELECT state_json FROM active_group_drags WHERE drag_id = ?1",
        dragId,
      )
      .toArray()[0];
    return row
      ? (JSON.parse(String(row.state_json)) as ActiveGroupDrag)
      : undefined;
  }

  /** 接続の操作IDから参照されなくなったグループ移動の保存状態を削除する。 */
  pruneGroupDrags(): void {
    if (!this.sql) return;
    const liveIds = new Set(
      this.connections.getWebSockets().flatMap((socket) => {
        const attachment =
          socket.deserializeAttachment() as SocketAttachment | null;
        return attachment?.activeDrag?.group
          ? [attachment.activeDrag.dragId]
          : [];
      }),
    );
    for (const row of this.sql
      .exec("SELECT drag_id FROM active_group_drags")
      .toArray()) {
      if (!liveIds.has(String(row.drag_id)))
        this.sql.exec(
          "DELETE FROM active_group_drags WHERE drag_id = ?1",
          row.drag_id,
        );
    }
  }

  /** 接続の操作権を解除し、終了配信に使う直前の移動状態を返す。 */
  retireActiveDrag(socket: WebSocket): ActiveDragOwner | null {
    const active = this.activeDragFor(socket);
    if (!active) return null;
    if (active.group)
      this.sql?.exec(
        "DELETE FROM active_group_drags WHERE drag_id = ?1",
        active.dragId,
      );
    socket.serializeAttachment({
      ...active.attachment,
      activeDrag: undefined,
    } satisfies SocketAttachment);
    return active;
  }

  /** フェーズ変更などで全接続の操作権と保存されたグループ移動を解除する。 */
  retireAllActiveDrags(): ActiveDragOwner[] {
    const retired: ActiveDragOwner[] = [];
    for (const socket of this.connections.getWebSockets()) {
      const active = this.retireActiveDrag(socket);
      if (active) retired.push(active);
    }
    this.sql?.exec("DELETE FROM active_group_drags");
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
