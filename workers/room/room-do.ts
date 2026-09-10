// 1ルーム = 1 Durable Object の権威サーバー（façade）。
// エントリポイント（RPC / WebSocket）と横断ガード（phase ゲート）だけを持ち、
// ドメインロジックは workers/room/ の各モジュールに委譲する:
// - members.ts … メンバーシップ・表示色・ホスト（room_owner）の真実
// - phase.ts   … 進行状態 (lobby / phase1-4) の真実と phase ゲート判定
// - timer.ts   … ルーム共有タイマーの真実（遷移は純粋関数）
// - notes.ts / note-handlers.ts … 付箋の確定状態の真実と操作
// - groups.ts  … グルーピングの真実と自動再編成
// - votes.ts   … ドット投票の集計・ポリシー
// - broadcast.ts … 配信。ノートは必ず visibleTo（workers/visibility.ts）を
//   通し（選択的送信）、メンバー参加・進行状態・タイマーのように参加者全員が
//   受け取る情報は broadcastToAll という別経路で送る
//
// D1 の rooms 行は「招待コード → ルーム解決」のためのディレクトリにすぎない。
// 単一スレッドで直列化されるため、フェーズ遷移や同時編集のレースは構造的に起きない。
// ハイバネーションでインメモリ状態は消える（次のイベントで constructor が再実行
// される）ため、状態は毎回 SQL から導出し、各モジュールにキャッシュを持たせない。
import { DurableObject } from "cloudflare:workers";
import type { RoomPhase } from "../../contracts/phase";
import {
  type ClientMessage,
  type ProtocolMember,
  parseClientMessage,
  type TimerState,
  WS_CLOSE_LEFT_ROOM,
  WS_CLOSE_LEFT_ROOM_REASON,
  WS_CLOSE_ROOM_DISBANDED,
  WS_CLOSE_ROOM_DISBANDED_REASON,
} from "../../contracts/room-protocol";
import {
  LEGACY_ROOM_DO_MIGRATION_IDS,
  migrateRoomStorage,
  ROOM_DO_MIGRATIONS,
} from "../room-do-migrations";
import { filterVisible, projectNoteForViewer } from "../visibility";
import { RoomBroadcaster, type SocketAttachment } from "./broadcast";
import { decisionHandlers } from "./decision-handlers";
import { getCarryovers, getDecision } from "./decisions";
import { groupHandlers, listVisibleGroups } from "./groups";
import type { HandlerCtx, MessageHandlers } from "./handler-context";
import {
  ensureHost,
  isHostUser,
  isMember,
  listMembers,
  removeMember,
  type UpsertMemberResult,
  upsertMember,
} from "./members";
import { noteHandlers } from "./note-handlers";
import { listNotes } from "./notes";
import {
  getBoardMutationForbiddenMessage,
  getPhase,
  phaseHandlers,
  savePhase,
} from "./phase";
import { presenceHandlers } from "./presence";
import { getTimerState, timerHandlers } from "./timer";

// api-worker がセッション検証済みのユーザーIDを DO へ引き継ぐヘッダー。
// DO は外部から直接到達できないため、これは常に api-worker が設定する。
export const USER_ID_HEADER = "X-Idea-Flow-User-Id";

// ルーム作成者のユーザーID。api-worker が D1 rooms.host_id を解決してセットする。
// 認可判定（isHostUser）はこのヘッダーを参照せず、常に room_owner だけを見る。
// それでもヘッダーが残るのはブートストラップ順序のため: room_owner テーブルを
// 追加した DO migration は D1 に到達できないため host_id を埋められず、
// それ以前に作られた旧ルームは WS 接続時にこの値でバックフィルしないと
// ホスト不在（誰もフェーズを進められない）のまま固定される。
export const HOST_ID_HEADER = "X-Idea-Flow-Host-Id";

// 全 ClientMessage を網羅するハンドラ表。メッセージ型を追加すると、
// ここでキー漏れがコンパイルエラーになる（旧 switch の never 網羅性チェック相当）。
const clientMessageHandlers: MessageHandlers<ClientMessage["type"]> = {
  ...noteHandlers,
  ...decisionHandlers,
  ...groupHandlers,
  ...phaseHandlers,
  ...timerHandlers,
  ...presenceHandlers,
};

export class RoomDO extends DurableObject {
  private readonly broadcaster: RoomBroadcaster;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.broadcaster = new RoomBroadcaster(ctx);
    // スキーマは room-do-migrations/ の版管理で管理する。
    // マイグレーション完了までイベント配信を止め、移行中のストレージに
    // 古い・新しいスキーマ前提の操作が届かないようにする。
    this.ctx.blockConcurrencyWhile(async () => {
      migrateRoomStorage(
        this.ctx.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
    });
  }

  private get sql(): SqlStorage {
    return this.ctx.storage.sql;
  }

  // ------------------------------------------------------------
  // RPC（api-worker からのみ呼ばれる）
  // ------------------------------------------------------------

  async upsertMember(
    userId: string,
    name: string | undefined,
  ): Promise<UpsertMemberResult> {
    return upsertMember(this.sql, this.broadcaster, userId, name);
  }

  // 新規ルーム作成直後にロビー状態へ。
  async initializeNewRoom(
    hostId: string,
    hostName: string | undefined,
  ): Promise<void> {
    await this.upsertMember(hostId, hostName);
    // room_owner は api-worker が D1 rooms.host_id から渡した値だけで初期化する。
    // 以後も WS 接続時の ensureHost 以外に独立して書き換える経路を持たない。
    ensureHost(this.sql, hostId);
    savePhase(this.sql, { kind: "lobby" });
  }

  isMember(userId: string): boolean {
    return isMember(this.sql, userId);
  }

  // 退出処理。
  async leave(userId: string): Promise<void> {
    if (!isMember(this.sql, userId)) {
      return;
    }
    for (const socket of this.ctx.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.userId === userId) {
        try {
          socket.close(WS_CLOSE_LEFT_ROOM, WS_CLOSE_LEFT_ROOM_REASON);
        } catch {
          // 既に閉じている等のエラーは握りつぶす
        }
      }
    }
    removeMember(this.sql, userId);
    this.broadcaster.broadcastToAllExcept(
      { type: "member_left", userId },
      userId,
    );
  }

  // ルーム解散（ホスト操作）。全 WS を閉じ、ストレージを完全に空にする。
  // deleteAll しないと room_state / room_owner / schema_migrations が残り、
  // Durable Object が GC 対象にならない。次回起床時は constructor の
  // マイグレーションがスキーマを再構築する。
  async disband(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.close(WS_CLOSE_ROOM_DISBANDED, WS_CLOSE_ROOM_DISBANDED_REASON);
      } catch {
        // 既に閉じている等のエラーは握りつぶす
      }
    }
    await this.ctx.storage.deleteAll();
  }

  listMembers(): ProtocolMember[] {
    return listMembers(this.sql);
  }

  getPhase(): RoomPhase {
    return getPhase(this.sql);
  }

  getTimerState(): TimerState {
    return getTimerState(this.sql);
  }

  // テスト用途限定の RPC。phase 順序や Step 1-4 の投票ゲートを通らず任意の
  // フェーズへ移動できるため、api-worker のエンドポイントなどクライアント
  // 到達経路には載せない（載せるとゲートが無言で無効化される）。
  async setPhase(phase: RoomPhase, byUserId: string): Promise<void> {
    if (!isHostUser(this.sql, byUserId)) {
      throw new Error("進行状態を変更する権限がありません。");
    }
    savePhase(this.sql, phase);
  }

  // ------------------------------------------------------------
  // WebSocket 接続
  // ------------------------------------------------------------

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const userId = request.headers.get(USER_ID_HEADER);
    if (!userId || !isMember(this.sql, userId)) {
      return new Response("forbidden", { status: 403 });
    }

    const hostId = request.headers.get(HOST_ID_HEADER);
    if (!hostId) {
      return new Response("forbidden", { status: 403 });
    }
    // hostId は api-worker が D1 rooms.host_id で必ず上書きした値。
    // 接続者本人ではなくこの値で、旧ルームの room_owner だけを補完する。
    ensureHost(this.sql, hostId);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const attachment: SocketAttachment = { userId };
    server.serializeAttachment(attachment);

    this.sendSnapshot(server, userId);

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    raw: ArrayBuffer | string,
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) {
      ws.close(1011, "missing attachment");
      return;
    }

    const message = parseClientMessage(raw);
    if (!message) {
      this.broadcaster.sendTo(ws, {
        type: "error",
        code: "invalid-message",
        message: "メッセージ形式が不正です。",
      });
      return;
    }

    await this.handleClientMessage(ws, attachment, message);
  }

  override async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // メンバーシップ自体は REST leave まで維持するが、一時カーソルと
    // 付箋の移動者表示は切断時に消す。
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (attachment?.hasCursor || attachment?.activeDragNoteId) {
      ws.serializeAttachment({
        ...attachment,
        hasCursor: false,
        activeDragNoteId: undefined,
      } satisfies SocketAttachment);
      if (this.broadcaster.hasOtherPresenceForUser(attachment.userId, ws)) {
        return;
      }
      this.broadcaster.broadcastToAllExcept(
        { type: "cursor:left", userId: attachment.userId },
        attachment.userId,
      );
    }
  }

  override async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    ws.close(1011, "websocket error");
  }

  // ------------------------------------------------------------
  // プロトコル処理
  // ------------------------------------------------------------

  private async handleClientMessage(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: ClientMessage,
  ): Promise<void> {
    const ctx = this.createHandlerCtx(ws, attachment.userId);
    const phase = getPhase(this.sql);
    const forbiddenMessage = getBoardMutationForbiddenMessage(phase, message);
    if (forbiddenMessage) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: forbiddenMessage,
      });
      return;
    }
    // message.type とペイロード型の相関は TS がインデックスアクセス越しに
    // 追えないため、呼び出し時だけ widening する。網羅性は
    // clientMessageHandlers の型注釈で担保済み。
    const handler = clientMessageHandlers[message.type] as (
      ctx: HandlerCtx,
      message: ClientMessage,
    ) => void | Promise<void>;
    await handler(ctx, message);
  }

  private createHandlerCtx(ws: WebSocket, userId: string): HandlerCtx {
    return {
      sql: this.sql,
      storage: this.ctx.storage,
      userId,
      ws,
      reply: (message) => this.broadcaster.sendTo(ws, message),
      broadcaster: this.broadcaster,
      refreshSnapshots: () => this.refreshSnapshots(),
    };
  }

  // 結果ステップへ進んだ既存接続も、再接続時と同じ受信者別 snapshot で
  // ノートの射影を更新する。添付情報がないソケットは有効な Room 接続ではない
  // ためスキップする。
  private refreshSnapshots(): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      this.sendSnapshot(socket, attachment.userId);
    }
  }

  // 接続直後に現在状態を丸ごと届ける（再接続の復帰パスも兼ねる）。
  private sendSnapshot(ws: WebSocket, userId: string): void {
    const phase = getPhase(this.sql);
    const notes = filterVisible(
      { viewerId: userId },
      listNotes(
        this.sql,
        userId,
        phase.kind === "step" ? phase.phase : undefined,
      ),
    ).map((note) => projectNoteForViewer({ viewerId: userId, phase }, note));

    this.broadcaster.sendTo(ws, {
      type: "snapshot",
      notes,
      // フェーズ2では既存のフェーズ1グループも表示しない。
      groups:
        phase.kind === "step" && phase.phase === 2
          ? []
          : listVisibleGroups(this.sql, userId),
      members: listMembers(this.sql),
      phase,
      isHost: isHostUser(this.sql, userId),
      decision:
        phase.kind === "step" ? getDecision(this.sql, phase.phase) : null,
      carryovers:
        phase.kind === "step" ? getCarryovers(this.sql, phase.phase) : [],
      timer: getTimerState(this.sql),
      serverNow: Date.now(),
    });
  }
}
