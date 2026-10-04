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
import type {
  CompletedBoardResponse,
  CompletedRoom,
  CompletedSceneKind,
  LeaveOutcomeAccess,
} from "../../contracts/completed-rooms";
import {
  isPhaseStep,
  isVotingStep,
  type RoomPhase,
} from "../../contracts/phase";
import {
  type ClientMessage,
  needsHostRevision,
  type ProtocolMember,
  parseClientMessage,
  type TimerState,
  WS_CLOSE_LEFT_ROOM,
  WS_CLOSE_LEFT_ROOM_REASON,
  WS_CLOSE_ROOM_DISBANDED,
  WS_CLOSE_ROOM_DISBANDED_REASON,
} from "../../contracts/room-protocol";
import type {
  ProgressHistoryRecord,
  ProgressHistoryResponse,
  SharedOutcomeRecord,
  SharedOutcomeSnapshot,
} from "../../contracts/shared-outcomes";
import {
  LEGACY_ROOM_DO_MIGRATION_IDS,
  migrateRoomStorage,
  ROOM_DO_MIGRATIONS,
} from "../room-do-migrations";
import { filterVisible, projectNoteForViewer } from "../visibility";
import { adoptionFocusHandlers } from "./adoption-focus-handlers";
import { syncRoomAlarm } from "./alarms";
import { RoomBroadcaster, type SocketAttachment } from "./broadcast";
import {
  CompletedRoomStorage,
  fixCompletion,
  isRoomClosed,
  readCompletion,
} from "./completed-rooms";
import { decisionHandlers } from "./decision-handlers";
import { getCarryovers, getDecision } from "./decisions";
import { groupHandlers, listBoardGroups } from "./groups";
import type { HandlerCtx, MessageHandlers } from "./handler-context";
import { hostHandlers } from "./host-transfer";
import {
  broadcastIdeaMapState,
  buildIdeaMapServerState,
  ideaMapHandlers,
  isIdeaMapVisiblePhase,
} from "./idea-map";
import { memberRemovalHandlers } from "./member-removal";
import {
  ensureHost,
  findMember,
  getHostState,
  type HostState,
  isHostUser,
  isMember,
  listMembers,
  removeMember,
  type UpsertMemberResult,
  upsertMember,
} from "./members";
import {
  expireMoveOperations,
  moveHandlers,
  moveRevisions,
  releaseConnectionMoves,
  syncMovePresence,
} from "./move-operations";
import { noteHandlers } from "./note-handlers";
import { broadcastNoteUpdated, findNote, listNotes } from "./notes";
import {
  completeExpiredPhaseTransition,
  getBoardMutationForbiddenMessage,
  getPendingPhaseTransition,
  getPhase,
  getPhaseRevision,
  isBoardMutation,
  phaseHandlers,
  savePhase,
} from "./phase";
import { presenceHandlers } from "./presence";
import { ProgressHistoryStorage } from "./progress-history";
import { SharedOutcomeStorage } from "./shared-outcome-storage";
import { captureSharedOutcome, readOutcomeState } from "./shared-outcomes";
import {
  broadcastSharing,
  sharingHandlers,
  startPendingSharingTurn,
} from "./sharing";
import {
  appendSharingMember,
  getSharingState,
  resetSharingForPhase,
} from "./sharing-state";
import { getTimerState, handleTimerAlarm, timerHandlers } from "./timer";
import { listCompletedVoterIds } from "./votes";

// api-worker がセッション検証済みのユーザーIDを DO へ引き継ぐヘッダー。
// DO は外部から直接到達できないため、これは常に api-worker が設定する。
export const USER_ID_HEADER = "X-Idea-Boost-User-Id";

// ルーム作成者のユーザーID。api-worker が D1 rooms.host_id を解決してセットする。
// 認可判定（isHostUser）はこのヘッダーを参照せず、常に room_owner だけを見る。
// それでもヘッダーが残るのはブートストラップ順序のため: room_owner テーブルを
// 追加した DO migration は D1 に到達できないため host_id を埋められず、
// それ以前に作られた旧ルームは WS 接続時にこの値でバックフィルしないと
// ホスト不在（誰もフェーズを進められない）のまま固定される。
export const HOST_ID_HEADER = "X-Idea-Boost-Host-Id";

// 全 ClientMessage を網羅するハンドラ表。メッセージ型を追加すると、
// ここでキー漏れがコンパイルエラーになる（旧 switch の never 網羅性チェック相当）。
const clientMessageHandlers: MessageHandlers<ClientMessage["type"]> = {
  ...hostHandlers,
  ...memberRemovalHandlers,
  ...adoptionFocusHandlers,
  ...noteHandlers,
  ...moveHandlers,
  ...decisionHandlers,
  ...groupHandlers,
  ...ideaMapHandlers,
  ...phaseHandlers,
  ...timerHandlers,
  ...sharingHandlers,
  ...presenceHandlers,
};

function optimisticOperationIdOf(message: ClientMessage): string | undefined {
  switch (message.type) {
    case "host:transfer":
    case "member:remove":
    case "note:exclude":
    case "note:restore":
    case "note:bulk-exclude":
    case "note:bulk-restore":
    case "note:update-font-size":
    case "note:vote":
    case "note:vote-reset":
    case "note:vote-remove":
    case "note:vote-sticker:add":
    case "note:vote-sticker:move":
    case "note:vote-sticker:remove":
    case "note:move:start":
    case "note:move:preview":
    case "note:move:cancel":
    case "note:move:commit":
    case "note:move:status":
    case "note:update-content":
      return message.operationId;
    default:
      return undefined;
  }
}

export class RoomDO extends DurableObject {
  private readonly broadcaster: RoomBroadcaster;
  private readonly outcomes: SharedOutcomeStorage;
  private readonly history: ProgressHistoryStorage;
  private readonly completed: CompletedRoomStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.broadcaster = new RoomBroadcaster(ctx);
    this.history = new ProgressHistoryStorage(
      ctx,
      env.DB,
      (id, snapshot, expiresAt) =>
        this.writeProgressHistoryProjection(id, snapshot, expiresAt),
    );
    this.outcomes = new SharedOutcomeStorage(ctx, env.DB, (snapshot) =>
      this.writeSharedOutcomeProjection(snapshot),
    );
    this.completed = new CompletedRoomStorage(ctx, env.DB, this.history);
    // スキーマは room-do-migrations/ の版管理で管理する。
    // マイグレーション完了までイベント配信を止め、移行中のストレージに
    // 古い・新しいスキーマ前提の操作が届かないようにする。
    this.ctx.blockConcurrencyWhile(async () => {
      migrateRoomStorage(
        this.ctx.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      // 段階デプロイ前から生きる旧attachmentにも、最初の復帰時に有限leaseを与える。
      for (const socket of this.ctx.getWebSockets()) {
        const attachment =
          socket.deserializeAttachment() as SocketAttachment | null;
        if (!attachment?.activeDrag) continue;
        const leaseUntil =
          attachment.activeDrag.leaseUntil ?? Date.now() + 15_000;
        socket.serializeAttachment({
          ...attachment,
          activeDrag: { ...attachment.activeDrag, leaseUntil },
        } satisfies SocketAttachment);
        this.sql.exec(
          "INSERT OR REPLACE INTO legacy_note_drag_leases(user_id,drag_id,lease_until) VALUES (?1,?2,?3)",
          attachment.userId,
          attachment.activeDrag.dragId,
          leaseUntil,
        );
      }
      if (
        this.sql.exec("SELECT 1 FROM legacy_note_drag_leases LIMIT 1").toArray()
          .length > 0
      )
        await syncRoomAlarm(this.ctx.storage, this.sql);
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
    if (isRoomClosed(this.sql)) return { ok: false, reason: "room-closed" };
    const result = upsertMember(this.sql, this.broadcaster, userId, name);
    const member = result.ok ? findMember(this.sql, userId) : null;
    if (member && appendSharingMember(this.sql, member))
      broadcastSharing({ sql: this.sql, broadcaster: this.broadcaster });
    return result;
  }

  // 新規ルーム作成直後にロビー状態へ。
  async initializeNewRoom(
    hostId: string,
    hostName: string | undefined,
    outcomeIdentity?: { roomId: string; name?: string },
  ): Promise<void> {
    if (isRoomClosed(this.sql)) throw new Error("終了したルームです。");
    await this.upsertMember(hostId, hostName);
    // room_owner は api-worker が D1 rooms.host_id から渡した値だけで初期化する。
    // 以後も WS 接続・解散時は、同じ D1 の値で未設定の旧ルームだけを補完する。
    ensureHost(this.sql, hostId);
    savePhase(this.sql, { kind: "lobby" });
    if (outcomeIdentity)
      await this.initializeSharedOutcome(
        outcomeIdentity.roomId,
        outcomeIdentity.name,
      );
  }

  isCompleted(): boolean {
    // 再訪記録を持たない導入前のルームも、公開済みなら完了として扱う。
    return (
      this.sql.exec("SELECT outcome_published FROM room_state WHERE id=1").one()
        .outcome_published === 1
    );
  }

  isJoinable(): boolean {
    return !isRoomClosed(this.sql);
  }

  isMember(userId: string): boolean {
    return (
      !readCompletion(this.sql)?.deleted &&
      (readCompletion(this.sql)?.expires_at ?? Infinity) > Date.now() &&
      isMember(this.sql, userId)
    );
  }

  getCurrentHost(creatorSeed?: string): HostState {
    if (creatorSeed && !isRoomClosed(this.sql))
      ensureHost(this.sql, creatorSeed);
    return getHostState(this.sql);
  }

  // RESTの意図を現在の権限と同じDOイベント内で判定する。呼出側で
  // isHostを取得してからleaveへ分岐すると、移譲との間に競合ができる。
  async leaveOrDisband(
    userId: string,
    creatorSeed: string,
    intent?: "self" | "disband",
    expectedHostRevision?: number,
    outcomeAccess?: LeaveOutcomeAccess,
  ): Promise<"left" | "disbanded" | "not-member" | "forbidden"> {
    if (userId === creatorSeed && !isRoomClosed(this.sql))
      ensureHost(this.sql, creatorSeed);
    const host = getHostState(this.sql);
    const disbanded = Boolean(readOutcomeState(this.sql)?.disbanded);
    const canRetryDisband =
      disbanded &&
      (host.hostUserId === userId ||
        (!host.hostUserId &&
          host.hostRevision === 0 &&
          userId === creatorSeed));
    if (!isMember(this.sql, userId) && !canRetryDisband) return "not-member";
    if (
      (expectedHostRevision !== undefined &&
        expectedHostRevision !== host.hostRevision) ||
      (host.hostRevision > 0 && (!intent || expectedHostRevision === undefined))
    )
      return "forbidden";
    const isHost = host.hostUserId === userId;
    if (intent === "disband" || (!intent && isHost)) {
      if (!isHost && !canRetryDisband) return "forbidden";
      if (canRetryDisband) return "disbanded";
      return (await this.disband(userId)) ? "disbanded" : "forbidden";
    }
    if (!isMember(this.sql, userId)) return "not-member";
    if (isHost && !this.isCompleted()) return "forbidden";
    await this.leave(userId, outcomeAccess);
    return "left";
  }

  // REST退出もWS除外も、閲覧権の更新と会員削除をawait前に完了する。
  async leave(
    userId: string,
    outcomeAccess?: LeaveOutcomeAccess,
  ): Promise<void> {
    this.leaveMember(userId, outcomeAccess);
    await this.flushLeave();
  }

  private async flushLeave(): Promise<void> {
    await this.completed.flush();
    await syncRoomAlarm(this.ctx.storage, this.sql);
  }

  private leaveMember(
    userId: string,
    outcomeAccess?: LeaveOutcomeAccess,
  ): void {
    if (!isMember(this.sql, userId)) return;
    this.ctx.storage.transactionSync(() => {
      const completion = readCompletion(this.sql);
      if (outcomeAccess === "discard") this.completed.revokeViewer(userId);
      if (
        !completion &&
        outcomeAccess === "retain" &&
        !isRoomClosed(this.sql) &&
        (readOutcomeState(this.sql)?.expires_at ?? 0) > Date.now()
      )
        this.sql.exec(
          "INSERT INTO retained_outcome_participants(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING",
          userId,
        );
      else
        this.sql.exec(
          "DELETE FROM retained_outcome_participants WHERE user_id=?",
          userId,
        );
      removeMember(this.sql, userId);
    });
    syncMovePresence(this.sql, this.broadcaster);
    const retiredSharedNotes = new Set<string>();
    let hadPresence = false;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.userId !== userId) continue;
      hadPresence ||= Boolean(attachment.hasCursor || attachment.activeDrag);
      const active = this.broadcaster.retireActiveDrag(socket);
      if (active) retiredSharedNotes.add(active.noteId);
      // closeイベントの到着・同じIDの再参加を待たずに旧タブを無効にする。
      socket.serializeAttachment(null);
      try {
        socket.close(WS_CLOSE_LEFT_ROOM, WS_CLOSE_LEFT_ROOM_REASON);
      } catch {
        // 既に閉じている接続も会員削除を妨げない。
      }
    }
    this.broadcaster.broadcastToAllExcept(
      { type: "member_left", userId },
      userId,
    );
    for (const noteId of retiredSharedNotes) {
      const row = findNote(this.sql, noteId);
      if (row?.visibility === "shared")
        broadcastNoteUpdated(this.sql, this.broadcaster, row);
    }
    if (hadPresence)
      this.broadcaster.broadcastToAllExcept(
        { type: "cursor:left", userId },
        userId,
      );
    if (retiredSharedNotes.size > 0) {
      this.ctx.waitUntil(this.preserveSharedOutcome());
      if (isIdeaMapVisiblePhase(getPhase(this.sql)))
        this.broadcaster.broadcastToAll(
          buildIdeaMapServerState(this.sql, this.broadcaster),
        );
    }
  }

  // ルーム解散。参加・編集用の状態を消去し、期限内の成果と再試行だけ残す。
  async disband(byUserId?: string, hostId?: string): Promise<boolean> {
    if (
      readCompletion(this.sql) ||
      this.sql.exec("SELECT outcome_published FROM room_state WHERE id=1").one()
        .outcome_published === 1
    )
      return false;
    // WS 未接続の旧ルームも、api-worker が解決した D1 のホストで補完する。
    if (hostId) ensureHost(this.sql, hostId);
    if (
      byUserId &&
      !isHostUser(this.sql, byUserId) &&
      !readOutcomeState(this.sql)?.disbanded
    )
      return false;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.close(WS_CLOSE_ROOM_DISBANDED, WS_CLOSE_ROOM_DISBANDED_REASON);
      } catch {
        // 既に閉じている等のエラーは握りつぶす
      }
    }
    const outcome = readOutcomeState(this.sql);
    if (!outcome) {
      await this.ctx.storage.deleteAll();
      return true;
    }
    // 保全済みデータと outbox は解散後も維持し、自動再試行を継続する。
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE shared_outcome_identity SET disbanded = 1 WHERE id = 1",
      );
      for (const table of [
        "notes",
        "members",
        "retained_outcome_participants",
        "groups",
        "decisions",
        "note_votes",
        "note_vote_stickers",
        "note_content_receipts",
        "used_note_drag_ids",
        "legacy_note_drag_leases",
        "note_move_locks",
        "note_move_operations",
        "member_color_assignments",
        "pending_phase_transition",
        "sharing_state",
      ]) {
        const exists = this.sql
          .exec(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            table,
          )
          .toArray().length;
        if (exists) this.sql.exec(`DELETE FROM ${table}`);
      }
      this.sql.exec(
        "UPDATE timer_state SET status = 'idle', ends_at = NULL, remaining_ms = NULL, duration_ms = NULL WHERE id = 1",
      );
      // D1削除失敗時の本人による解散再試行に使う。期限後の完全削除で消去する。
      // 閉鎖済みのDOではこのIDから操作権を復活させない。
    });
    await syncRoomAlarm(this.ctx.storage, this.sql);
    return true;
  }

  async ensureSharedOutcome(roomId: string, createdAt?: number): Promise<void> {
    await this.outcomes.ensureSharedOutcome(roomId, createdAt);
    await this.ctx.storage.sync();
  }

  protected async initializeSharedOutcome(
    roomId: string,
    name?: string,
    createdAt = Date.now(),
  ): Promise<void> {
    await this.outcomes.initializeSharedOutcome(roomId, name, createdAt);
  }

  protected async preserveSharedOutcome(
    confirmed = false,
    now = Date.now(),
    participantCompletion = false,
  ): Promise<void> {
    await this.outcomes.preserveSharedOutcome(
      confirmed,
      now,
      participantCompletion
        ? (snapshot, time) => fixCompletion(this.sql, snapshot, time)
        : undefined,
    );
  }

  protected async writeSharedOutcomeProjection(
    snapshot: SharedOutcomeSnapshot | null,
  ): Promise<void> {
    await this.outcomes.writeSharedOutcomeProjection(snapshot);
  }

  protected async flushSharedOutcome(): Promise<void> {
    await this.outcomes.flushSharedOutcome();
    await this.history.flush();
    await this.completed.flush();
  }

  async getCompletedRoom(userId: string): Promise<CompletedRoom | null> {
    return this.completed.get(userId);
  }

  async getCompletedBoard(
    userId: string,
    kind: CompletedSceneKind,
  ): Promise<CompletedBoardResponse | null> {
    return this.completed.board(userId, kind);
  }

  async getSharedOutcome(): Promise<SharedOutcomeRecord | null> {
    return this.outcomes.getSharedOutcome();
  }

  async getProgressHistory(
    cursor = 0,
  ): Promise<ProgressHistoryResponse | null> {
    return this.history.list(cursor);
  }
  async getProgressHistoryRecord(
    id: string,
  ): Promise<ProgressHistoryRecord | null> {
    return this.history.get(id);
  }
  protected async writeProgressHistoryProjection(
    id: string,
    snapshot: string,
    expiresAt: number,
  ): Promise<void> {
    await this.history.writeProjection(id, snapshot, expiresAt);
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
    if (isRoomClosed(this.sql) || !isHostUser(this.sql, byUserId)) {
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

    if (!(await this.processExpiredTransition()))
      return new Response("保存期限後の削除を再試行しています。", {
        status: 503,
      });
    if (readCompletion(this.sql))
      return new Response("not found", { status: 404 });
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
    const parsedMessage = parseClientMessage(raw);
    if (
      !(await this.processExpiredTransition()) &&
      parsedMessage?.type !== "note:move:status"
    ) {
      this.broadcaster.sendTo(ws, {
        type: "error",
        code: "invalid-message",
        message:
          "保存期限後の削除を再試行しています。時間をおいてもう一度お試しください。",
      });
      return;
    }
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || ws.readyState !== WebSocket.OPEN) {
      ws.close(1011, "missing attachment");
      return;
    }

    const message = parsedMessage;
    if (!message) {
      this.broadcaster.sendTo(ws, {
        type: "error",
        code: "invalid-message",
        message: "メッセージ形式が不正です。",
      });
      return;
    }

    try {
      await this.handleClientMessage(ws, attachment, message);
    } catch (error) {
      if (message.type !== "start_phase" && !message.type.startsWith("phase:"))
        throw error;
      this.broadcaster.sendTo(ws, {
        type: "error",
        code: "invalid-message",
        message: "進行の記録を保存できませんでした。もう一度お試しください。",
      });
    }
  }

  override async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    // メンバーシップ自体は REST leave まで維持するが、一時カーソルと
    // 付箋の移動者表示は切断時に消す。
    const previousAttachment =
      ws.deserializeAttachment() as SocketAttachment | null;
    if (previousAttachment?.moveConnectionId) {
      releaseConnectionMoves(this.sql, previousAttachment.moveConnectionId);
      syncMovePresence(this.sql, this.broadcaster);
      // close対象は一覧から消えていることがある。他接続のretire件数によらず
      // この操作自身を終了する。重複通知もoperation IDで安全に除去できる。
      if (previousAttachment.activeMoveOperationId) {
        this.broadcaster.broadcastMoveEnded(
          previousAttachment.activeMoveOperationId,
          (viewerId) => isMember(this.sql, viewerId),
        );
        this.broadcaster.broadcastToAll({
          type: "cursor:drag-ended",
          userId: previousAttachment.userId,
        });
        broadcastIdeaMapState(this.sql, this.broadcaster);
      }
    }
    if (previousAttachment?.activeDrag)
      this.sql.exec(
        "DELETE FROM legacy_note_drag_leases WHERE user_id=?1 AND drag_id=?2",
        previousAttachment.userId,
        previousAttachment.activeDrag.dragId,
      );
    if (previousAttachment?.moveConnectionId || previousAttachment?.activeDrag)
      await syncRoomAlarm(this.ctx.storage, this.sql);
    if (this.broadcaster.retireAdoptionFocus(ws)) {
      this.broadcaster.broadcastToAll({
        type: "adoption-focus:updated",
        noteId: null,
      });
    }
    if (previousAttachment?.hasCursor || previousAttachment?.activeDrag) {
      const active = this.broadcaster.retireActiveDrag(ws);
      const attachment =
        (ws.deserializeAttachment() as SocketAttachment | null) ??
        previousAttachment;
      ws.serializeAttachment({
        ...attachment,
        hasCursor: false,
      } satisfies SocketAttachment);
      if (active) {
        const row = findNote(this.sql, active.noteId);
        if (row?.visibility === "shared") {
          // 終了メッセージが届かない切断でも、最後に受理した座標を保全する。
          await this.preserveSharedOutcome();
          broadcastNoteUpdated(this.sql, this.broadcaster, row);
        }
        if (isIdeaMapVisiblePhase(getPhase(this.sql))) {
          this.broadcaster.broadcastToAll(
            buildIdeaMapServerState(this.sql, this.broadcaster),
          );
        }
      }
      if (this.broadcaster.hasOtherPresenceForUser(attachment.userId, ws)) {
        if (active) {
          this.broadcaster.broadcastToAllExcept(
            { type: "cursor:drag-ended", userId: attachment.userId },
            attachment.userId,
          );
        }
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

  override async alarm(): Promise<void> {
    expireMoveOperations(this.sql);
    syncMovePresence(this.sql, this.broadcaster);
    const expiredDrags = this.broadcaster.expireActiveDrags();
    this.sql.exec(
      "DELETE FROM legacy_note_drag_leases WHERE lease_until<=?1",
      Date.now(),
    );
    for (const drag of expiredDrags)
      this.broadcaster.broadcastToAll({
        type: "cursor:drag-ended",
        userId: drag.attachment.userId,
      });
    if (expiredDrags.length > 0)
      broadcastIdeaMapState(this.sql, this.broadcaster);

    if (!(await this.processExpiredTransition())) return;
    if (isRoomClosed(this.sql)) {
      // 導入前の完了では fixCompletion を通っていないため、残った進行予約も止める。
      this.ctx.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM pending_phase_transition");
        this.sql.exec("DELETE FROM sharing_state");
        this.sql.exec(
          "UPDATE timer_state SET status='idle',ends_at=NULL,remaining_ms=NULL,duration_ms=NULL WHERE id=1",
        );
      });
      await this.flushSharedOutcome();
      await syncRoomAlarm(this.ctx.storage, this.sql);
      return;
    }
    await startPendingSharingTurn({
      sql: this.sql,
      storage: this.ctx.storage,
      broadcaster: this.broadcaster,
    });
    await handleTimerAlarm(this.sql, this.broadcaster);
    await this.flushSharedOutcome();
    await syncRoomAlarm(this.ctx.storage, this.sql);
  }

  private async processExpiredTransition(): Promise<boolean> {
    const outcome = readOutcomeState(this.sql);
    if (outcome && outcome.expires_at <= Date.now()) {
      // 期限後の再開が未削除の過去記録を延命しないよう、共有操作より先に削除する。
      await this.flushSharedOutcome();
      const remaining = readOutcomeState(this.sql);
      if (
        remaining?.saved_json ||
        remaining?.pending_json ||
        this.sql.exec("SELECT 1 FROM progress_history LIMIT 1").toArray()
          .length > 0
      )
        return false;
    }
    if (isRoomClosed(this.sql)) return true;
    const ctx = this.createHandlerCtx({} as WebSocket, "");
    const before = getPhaseRevision(this.sql);
    try {
      await completeExpiredPhaseTransition({ ...ctx, reply: () => {} });
    } catch {
      this.sql.exec("DELETE FROM pending_phase_transition WHERE id=1");
      this.broadcaster.broadcastToAll({
        type: "error",
        code: "invalid-message",
        message: "進行の記録を保存できませんでした。もう一度お試しください。",
      });
      await syncRoomAlarm(this.ctx.storage, this.sql);
      return true;
    }
    if (getPhaseRevision(this.sql) !== before) {
      await this.outcomes.recordSharedActivity();
      try {
        await this.preserveSharedOutcome();
      } catch {
        /* 履歴の保全は移行と同時に成立済み */
      }
    }
    return true;
  }

  // ------------------------------------------------------------
  // プロトコル処理
  // ------------------------------------------------------------

  private async handleClientMessage(
    ws: WebSocket,
    attachment: SocketAttachment,
    message: ClientMessage,
  ): Promise<void> {
    if (!isMember(this.sql, attachment.userId)) {
      if (message.type === "note:move:status") {
        // 除外・期限削除後も結果不明を終端にする。存在/所有/内容は一切返さない。
        this.broadcaster.sendTo(ws, {
          type: "note:move:result",
          operationId: message.operationId,
          status: "unknown",
        });
        return;
      }
      this.broadcaster.sendTo(ws, {
        type: "error",
        code: "forbidden",
        message: "ルームに参加していません。",
      });
      return;
    }
    const ctx = this.createHandlerCtx(
      ws,
      attachment.userId,
      optimisticOperationIdOf(message),
    );
    if (message.type === "note:move:status") {
      moveHandlers["note:move:status"](ctx, message);
      syncMovePresence(this.sql, this.broadcaster);
      return;
    }
    if (isRoomClosed(this.sql) && message.type !== "outcome:publish") {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "完了したルームは変更できません。",
      });
      return;
    }
    // 世代を持たない旧クライアントは初代ホストの期間のみ互換受理する。
    // 発表者本人の完了はホストとは別の権限で、現在ターンのrevisionで検証する。
    const sharing = getSharingState(this.sql);
    const presenterDone =
      message.type === "sharing:advance" &&
      message.outcome === "done" &&
      sharing?.status === "active" &&
      sharing.currentIndex !== null &&
      sharing.order[sharing.currentIndex]?.userId === attachment.userId;
    if (
      needsHostRevision(message) &&
      message.type !== "host:transfer" &&
      !presenterDone &&
      (message.expectedHostRevision ?? 0) !==
        getHostState(this.sql).hostRevision
    ) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message:
          "ホストが変更されています。現在の状態を確認して操作し直してください。",
      });
      return;
    }
    const phase = getPhase(this.sql);
    const forbiddenMessage =
      phase.kind === "step" &&
      getDecision(this.sql, phase.phase) &&
      isBoardMutation(message) &&
      message.type !== "decision:clear"
        ? "採用確定後はボードを変更できません。"
        : getBoardMutationForbiddenMessage(phase, message);
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
    // 完了の成功通知より先に、同じ瞬間の盤面と再試行情報を永続化する。
    if (
      message.type === "outcome:publish" &&
      isHostUser(this.sql, attachment.userId) &&
      isPhaseStep(phase, 3, 5) &&
      getDecision(this.sql, 3)
    ) {
      if (
        this.sql
          .exec("SELECT outcome_published FROM room_state WHERE id=1")
          .one().outcome_published === 1
      ) {
        ctx.reply({ type: "outcome:published", published: true });
        return;
      }
      try {
        await this.preserveSharedOutcome(true, Date.now(), true);
      } catch {
        ctx.reply({
          type: "error",
          code: "invalid-message",
          message:
            "完了時点の内容を保全できませんでした。接続を確認してもう一度お試しください。",
        });
        return;
      }
      syncMovePresence(this.sql, this.broadcaster);
      this.broadcaster.broadcastToAll({
        type: "outcome:published",
        published: true,
      });
      return;
    }
    const affectsOutcome =
      isBoardMutation(message) &&
      !message.type.startsWith("note:drag:") &&
      (!message.type.startsWith("note:move:") ||
        message.type === "note:move:commit");
    const phaseBefore = getPhaseRevision(this.sql);
    const before = affectsOutcome
      ? JSON.stringify(captureSharedOutcome(this.sql, 0))
      : null;
    const affectsSharedActivity =
      message.type.startsWith("timer:") || message.type.startsWith("sharing:");
    const activityBefore = affectsSharedActivity
      ? JSON.stringify({
          timer: getTimerState(this.sql),
          sharing: getSharingState(this.sql),
        })
      : null;
    let rejected = false;
    const reply = ctx.reply;
    ctx.reply = (response) => {
      if (response.type === "error") rejected = true;
      reply(response);
    };
    let sharedDragEnded = false;
    ctx.onSharedDragEnd = () => {
      sharedDragEnded = true;
    };
    await handler(ctx, message);
    if (isBoardMutation(message) || message.type === "member:remove")
      syncMovePresence(this.sql, this.broadcaster);
    if (
      message.type.startsWith("note:move:") ||
      message.type.startsWith("note:drag:")
    )
      await syncRoomAlarm(this.ctx.storage, this.sql);
    const after = affectsOutcome
      ? JSON.stringify(captureSharedOutcome(this.sql, 0))
      : null;
    const sharedVote =
      message.type.startsWith("note:vote") &&
      "noteId" in message &&
      typeof message.noteId === "string" &&
      findNote(this.sql, message.noteId)?.visibility === "shared";
    if (getPhaseRevision(this.sql) !== phaseBefore) {
      await this.outcomes.recordSharedActivity();
      try {
        await this.preserveSharedOutcome();
      } catch {
        /* 履歴は移行と同時に保全済み */
      }
    } else if (
      before !== after ||
      (!rejected && (sharedVote || sharedDragEnded))
    )
      await this.preserveSharedOutcome();
    else if (!rejected && affectsSharedActivity) {
      const activityAfter = JSON.stringify({
        timer: getTimerState(this.sql),
        sharing: getSharingState(this.sql),
      });
      if (activityBefore !== activityAfter)
        await this.outcomes.recordSharedActivity();
    }
  }

  private createHandlerCtx(
    ws: WebSocket,
    userId: string,
    operationId?: string,
  ): HandlerCtx {
    return {
      sql: this.sql,
      storage: this.ctx.storage,
      userId,
      ws,
      reply: (message) =>
        this.broadcaster.sendTo(
          ws,
          message.type === "error" && operationId !== undefined
            ? { ...message, operationId }
            : message,
        ),
      operationId,
      broadcaster: this.broadcaster,
      refreshSnapshots: () => this.refreshSnapshots(),
      leaveMember: (targetUserId) => {
        this.leaveMember(targetUserId, "discard");
        this.ctx.waitUntil(this.flushLeave());
      },
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
    // 更新前から共有中のルームも、最初の接続で一度だけ順番を作る。
    if (
      phase.kind === "step" &&
      phase.step === 2 &&
      !getSharingState(this.sql)
    ) {
      resetSharingForPhase(this.sql, phase);
    }
    const ideaMapState = buildIdeaMapServerState(
      this.sql,
      this.broadcaster,
      phase,
    );
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
      moveProtocolVersion: 1,
      ...moveRevisions(this.sql),
      sharing: getSharingState(this.sql),
      notes,
      // フェーズ2では既存のフェーズ1グループも表示しない。
      groups: listBoardGroups(this.sql, userId, phase),
      members: listMembers(this.sql),
      phase,
      phaseRevision: getPhaseRevision(this.sql),
      pendingPhaseTransition: getPendingPhaseTransition(this.sql),
      isHost: isHostUser(this.sql, userId),
      ...getHostState(this.sql),
      ideaMapSizeLevel: ideaMapState.sizeLevel,
      ideaMapSizeInitialized: ideaMapState.initialized,
      ideaMapDragging: ideaMapState.isDragging,
      decision:
        phase.kind === "step" ? getDecision(this.sql, phase.phase) : null,
      outcomePublished:
        this.sql
          .exec("SELECT outcome_published FROM room_state WHERE id = 1")
          .one().outcome_published === 1,
      adoptionFocusNoteId: this.broadcaster.currentAdoptionFocusNoteId(),
      carryovers:
        phase.kind === "step" ? getCarryovers(this.sql, phase.phase) : [],
      completedVoterIds:
        phase.kind === "step" && isVotingStep(phase)
          ? listCompletedVoterIds(this.sql, phase.phase)
          : [],
      timer: getTimerState(this.sql),
      serverNow: Date.now(),
    });
  }
}
