// 進行状態（lobby / 課題整理のステップ）の真実と、進行操作・境界ゲート。
import {
  getInitialIdeaMapSizeLevel,
  isIdeaValueFeasibilityMapCoordinate,
} from "../../contracts/board";
import {
  getRoomPhaseLabel,
  isLobby,
  isPhaseStep,
  isRestartWritingAllowedStep,
  isResultStep,
  isVotingStep,
  type PHASE_STEP_COUNTS,
  type RoomPhase,
  RoomPhaseSchema,
  VOTING_STEP_BY_PHASE,
} from "../../contracts/phase";
import {
  ADVANCE_NOTICE_MS,
  ADVANCE_NOTICE_TIMEOUT_MS,
  type AdvanceNotice,
  type AdvanceNoticeEndReason,
  type ClientMessage,
} from "../../contracts/room-protocol";
import {
  broadcastAdvanceNotice,
  clearAdvanceNotice,
  getAdvanceNotice,
  holdVotesNotice,
  isVotesNoticeHeld,
  saveAdvanceNotice,
} from "./advance-notice";
import { syncRoomAlarm } from "./alarms";
import { isRoomClosed } from "./completed-rooms";
import { getDecision } from "./decisions";
import { clearUsedNoteDragIds } from "./drag-operations";
import { finalizeGrouping } from "./groups";
import {
  type HandlerCtx,
  type MessageHandlers,
  replyForbidden,
  runAuthorizedMutationTransaction,
} from "./handler-context";
import { isMember } from "./members";
import {
  deleteNote,
  excludeNotesForBulkOperation,
  hasCandidateNotes,
  listAutomaticExclusionCandidates,
  type NoteRow,
} from "./notes";
import {
  captureRollbackCheckpoint,
  clearRollbackHistory,
  getRollbackTarget,
} from "./phase-rollback";
import { bumpProgressRevision, listConnectedMemberIds } from "./progress";
import {
  isAdditionalWriting,
  recordProgressTransition,
} from "./progress-history";
import { getSharingState, resetSharingForPhase } from "./sharing-state";
import { getTimerState, resetTimerState } from "./timer";
import { deleteNoteVotes, hasCompletedVoting } from "./votes";

export function getPhase(sql: SqlStorage): RoomPhase {
  const rows = sql.exec("SELECT phase FROM room_state WHERE id = 1").toArray();
  const row = rows[0] as { phase: string } | undefined;
  return decodePhase(row?.phase ?? "lobby");
}

// 1-1の下書き（本人専用付箋）だけは、タイマーの開始・終了に関わらず
// 作成・編集・削除できる。可視性と作者の検証は各note handlerで別途行う。
export function isTimerExemptPersonalNoteMutation(
  phase: RoomPhase,
  message: ClientMessage,
): boolean {
  if (!isPhaseStep(phase, 1, 1)) return false;
  switch (message.type) {
    case "note:create":
    case "note:update-content":
    case "note:delete":
      return true;
    default:
      return false;
  }
}

export function savePhase(sql: SqlStorage, phase: RoomPhase): void {
  sql.exec(
    "UPDATE room_state SET phase = ?1, phase_revision = phase_revision + 1 WHERE id = 1",
    encodePhase(phase),
  );
  // 工程が変わったら、前の工程の予告は理由を問わず無効にする。
  clearAdvanceNotice(sql);
  bumpProgressRevision(sql);
}

export function getPhaseRevision(sql: SqlStorage): number {
  return Number(
    sql.exec("SELECT phase_revision FROM room_state WHERE id = 1").one()
      .phase_revision,
  );
}

// 旧デプロイで保存待ちを予約したルームにも待機や二重進行を復活させない。
// snapshot の互換フィールドは維持するが、新規予約は作らない。
export function getPendingPhaseTransition(_sql: SqlStorage): null {
  return null;
}

export async function completeExpiredPhaseTransition(
  ctx: HandlerCtx,
): Promise<void> {
  ctx.sql.exec("DELETE FROM pending_phase_transition WHERE id = 1");
  await syncRoomAlarm(ctx.storage, ctx.sql);
}

function matchesExpectedPhase(
  ctx: Pick<HandlerCtx, "sql">,
  message: { expectedPhase: RoomPhase; expectedRevision: number },
): boolean {
  return (
    encodePhase(getPhase(ctx.sql)) === encodePhase(message.expectedPhase) &&
    getPhaseRevision(ctx.sql) === message.expectedRevision
  );
}

function encodePhase(phase: RoomPhase): string {
  if (isLobby(phase)) return "lobby";
  return `phase${phase.phase}-step${phase.step}`;
}

// 保存形式は encodePhase が書く「lobby / phaseN-stepM」だけ。旧フラット形式
// （writing / phase1..4）は migration normalize-legacy-phase-values が保存時に
// 正規化済み。未知の値は lobby へ fail-safe する（進行を勝手に進めない側に倒す）。
function decodePhase(value: string): RoomPhase {
  if (value === "lobby") return { kind: "lobby" };
  const match = /^phase(\d+)-step(\d+)$/.exec(value);
  if (!match) return { kind: "lobby" };
  const parsed = RoomPhaseSchema.safeParse({
    kind: "step",
    phase: Number(match[1]),
    step: Number(match[2]),
  });
  return parsed.success ? parsed.data : { kind: "lobby" };
}

function nextRoomPhase(current: RoomPhase): RoomPhase {
  if (isLobby(current)) return { kind: "step", phase: 1, step: 1 };
  if (current.phase === 1 && current.step < 5) {
    return { ...current, step: current.step + 1 };
  }
  if (current.phase === 1 && current.step === 5) {
    return { kind: "step", phase: 2, step: 1 };
  }
  if (current.phase === 2 && current.step === 1) {
    return { kind: "step", phase: 2, step: 2 };
  }
  if (current.phase === 2 && current.step >= 2 && current.step < 4) {
    return { ...current, step: current.step + 1 };
  }
  if (current.phase === 2 && current.step === 4) {
    return { kind: "step", phase: 3, step: 1 };
  }
  if (current.phase === 3 && current.step < 5) {
    return { ...current, step: current.step + 1 };
  }
  return current;
}

// 同フェーズの下書きは保持し、次フェーズまたは最終完了時に破棄する。
export function discardPrivateNotes(sql: SqlStorage): void {
  sql.exec(
    `DELETE FROM note_vote_stickers
     WHERE note_id IN (SELECT id FROM notes WHERE visibility = 'private')`,
  );
  sql.exec(
    `DELETE FROM note_votes
     WHERE note_id IN (SELECT id FROM notes WHERE visibility = 'private')`,
  );
  sql.exec(
    `DELETE FROM note_appearances
     WHERE note_id IN (SELECT id FROM notes WHERE visibility = 'private')`,
  );
  sql.exec("DELETE FROM notes WHERE visibility = 'private'");
}

function discardEmptySharedNotes(sql: SqlStorage, phase: number): boolean {
  const rows = sql
    .exec(
      "SELECT id, content FROM notes WHERE phase = ?1 AND visibility = 'shared'",
      phase,
    )
    .toArray() as Array<{ id: string; content: string }>;
  const noteIds = new Set(
    rows.filter(({ content }) => content.trim() === "").map(({ id }) => id),
  );
  if (noteIds.size === 0) return false;

  const groups = sql
    .exec("SELECT id, note_ids FROM groups")
    .toArray() as Array<{ id: string; note_ids: string }>;
  for (const group of groups) {
    const groupNoteIds = JSON.parse(group.note_ids) as string[];
    if (groupNoteIds.some((noteId) => noteIds.has(noteId))) {
      sql.exec("DELETE FROM groups WHERE id = ?1", group.id);
    }
  }

  for (const noteId of noteIds) {
    deleteNoteVotes(sql, noteId);
    deleteNote(sql, noteId);
  }
  return true;
}

function discardEmptyPrivateNotes(sql: SqlStorage, phase: number): void {
  const rows = sql
    .exec(
      "SELECT id, content FROM notes WHERE phase = ?1 AND visibility = 'private'",
      phase,
    )
    .toArray() as Array<{ id: string; content: string }>;
  for (const { id, content } of rows) {
    if (content.trim() === "") deleteNote(sql, id);
  }
}

// WebSocket を直接送られても状態が変わらないよう、変更系メッセージを
// room-do.ts の handleClientMessage 前段で一元的に判定する。
export function isBoardMutation(message: ClientMessage): boolean {
  switch (message.type) {
    case "note:create":
    case "note:publish":
    case "note:unpublish":
    case "note:update-content":
    case "note:update-font-size":
    case "note:move:inverse":
    case "note:move:start":
    case "note:move:preview":
    case "note:move:commit":
    case "note:move":
    case "note:bring-to-front":
    case "note:drag:start":
    case "note:drag:move":
    case "note:drag:end":
    case "note:exclude":
    case "note:restore":
    case "note:bulk-exclude":
    case "note:bulk-restore":
    case "note:delete":
    case "note:vote":
    case "note:vote-reset":
    case "note:vote-remove":
    case "note:vote-sticker:add":
    case "note:vote-sticker:move":
    case "note:vote-sticker:remove":
    case "note:decide":
    case "decision:clear":
    case "group:create":
    case "group:update-name":
    case "idea-map:resize":
      return true;
    case "reaction:send":
    case "cursor:update":
    case "view:update":
    case "presenter-follow:update":
    case "note:share:status":
    case "note:move:status":
    case "note:move:cancel":
    case "note:content-status":
    case "cursor:leave":
    case "adoption-focus:update":
    case "host:transfer":
    case "member:remove":
    case "room:rename":
    case "member:rename":
    case "member:cycle-avatar":
    case "start_phase":
    case "phase:rollback":
    case "phase:next":
    case "phase:hold":
    case "phase:ready":
    case "outcome:publish":
    case "phase:restart-writing":
    case "phase:revote":
    case "sharing:start":
    case "sharing:advance":
    case "timer:start":
    case "timer:pause":
    case "timer:resume":
    case "timer:extend":
    case "timer:stop":
      return false;
  }
}

const allowedBoardMutationsByPhase: {
  [Phase in keyof typeof PHASE_STEP_COUNTS]: Record<
    number,
    readonly ClientMessage["type"][]
  >;
} = {
  1: {
    1: [
      "note:create",
      "note:update-content",
      "note:update-font-size",
      "note:delete",
    ],
    2: [
      "note:publish",
      "note:unpublish",
      "note:update-content",
      "note:update-font-size",
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
    ],
    3: [
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
      "group:create",
      "group:update-name",
    ],
    4: [
      "note:vote",
      "note:vote-reset",
      "note:vote-remove",
      "note:vote-sticker:add",
      "note:vote-sticker:move",
      "note:vote-sticker:remove",
    ],
    5: [
      "note:exclude",
      "note:restore",
      "note:bulk-exclude",
      "note:bulk-restore",
      "note:decide",
      "decision:clear",
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
    ],
  },
  2: {
    // Step 2-1（問いの個人執筆）は自分専用付箋の作成・編集・削除だけ。
    1: [
      "note:create",
      "note:update-content",
      "note:update-font-size",
      "note:delete",
    ],
    // Step 2-2（共有）は個人執筆済み付箋の publish と、共有後の共同編集。
    // 作成・削除・グループ操作は、フェーズ2の以降のステップでも許可しない。
    2: [
      "note:publish",
      "note:unpublish",
      "note:update-content",
      "note:update-font-size",
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
    ],
    3: [
      "note:vote",
      "note:vote-reset",
      "note:vote-remove",
      "note:vote-sticker:add",
      "note:vote-sticker:move",
      "note:vote-sticker:remove",
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
    ],
    4: [
      "note:exclude",
      "note:restore",
      "note:bulk-exclude",
      "note:bulk-restore",
      "note:decide",
      "decision:clear",
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
    ],
  },
  3: {
    1: [
      "note:create",
      "note:update-content",
      "note:update-font-size",
      "note:delete",
    ],
    2: [
      "note:publish",
      "note:unpublish",
      "note:update-content",
      "note:update-font-size",
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
      "idea-map:resize",
    ],
    3: [
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
      "idea-map:resize",
    ],
    4: [
      "note:vote",
      "note:vote-reset",
      "note:vote-remove",
      "note:vote-sticker:add",
      "note:vote-sticker:move",
      "note:vote-sticker:remove",
    ],
    5: [
      "note:exclude",
      "note:restore",
      "note:bulk-exclude",
      "note:bulk-restore",
      "note:decide",
      "decision:clear",
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
    ],
  },
};

function isIdeaValueFeasibilityMapPositionMessage(
  message: ClientMessage,
): message is Extract<
  ClientMessage,
  {
    type: "note:publish" | "note:move" | "note:drag:move" | "note:drag:end";
  }
> {
  return (
    message.type === "note:publish" ||
    message.type === "note:move" ||
    message.type === "note:drag:move" ||
    message.type === "note:drag:end"
  );
}

function isIdeaValueFeasibilityMappingStep(phase: RoomPhase): boolean {
  return (
    !isLobby(phase) &&
    phase.phase === 3 &&
    (phase.step === 2 || phase.step === 3 || phase.step === 5)
  );
}

// 変更系メッセージをハンドラより前に判定する。null は許可、文字列は拒否理由。
// author / 可視性の認可は、このゲート通過後に各ハンドラで検証する。
export function getBoardMutationForbiddenMessage(
  phase: RoomPhase,
  message: ClientMessage,
): string | null {
  if (!isBoardMutation(message)) return null;
  if (
    message.type === "note:move:inverse" ||
    message.type === "note:move:start" ||
    message.type === "note:move:preview" ||
    message.type === "note:move:commit"
  )
    return getBoardMutationForbiddenMessage(phase, {
      type: "note:move",
      noteId: "",
      x: 0,
      y: 0,
    });
  if (isLobby(phase)) return "ボード開始前はボードを変更できません。";
  if (
    isIdeaValueFeasibilityMappingStep(phase) &&
    isIdeaValueFeasibilityMapPositionMessage(message)
  ) {
    const position =
      message.type === "note:drag:end" ? message.position : message;
    if (
      position &&
      (!isIdeaValueFeasibilityMapCoordinate(position.x) ||
        !isIdeaValueFeasibilityMapCoordinate(position.y))
    ) {
      return `${getRoomPhaseLabel(phase)}では2軸マップ内（0〜100）の位置を指定してください。`;
    }
  }
  const allowed = allowedBoardMutationsByPhase[phase.phase]?.[phase.step] ?? [];
  if (allowed.includes(message.type)) return null;
  return `${getRoomPhaseLabel(phase)}ではこの操作を行えません。`;
}

type AdvanceScope = Pick<HandlerCtx, "sql" | "broadcaster">;

// 工程固有の条件で進めない理由。null なら進める。message が null のときは
// 進む先が無い（最終ステップ）ので、エラーを返さずに何もしない。
// 完了の表明と時間切れは条件に含めない（ADR 0037）。
export function getAdvanceBlock(
  ctx: AdvanceScope,
  current: RoomPhase,
): { message: string | null } | null {
  if (isLobby(current))
    return { message: "ロビー中は次フェーズに進めません。" };
  if (isRoomClosed(ctx.sql))
    return { message: "完了したルームは変更できません。" };
  if (current.step === 2) {
    const sharing = getSharingState(ctx.sql);
    if (sharing && sharing.status !== "complete")
      return { message: "発表順が一巡するまで次へ進めません。" };
  }
  if (isVotingStep(current)) {
    const connectedUserIds = listConnectedMemberIds(ctx.sql, ctx.broadcaster);
    if (
      connectedUserIds.length === 0 ||
      connectedUserIds.some(
        (userId) => !hasCompletedVoting(ctx.sql, userId, current.phase),
      )
    )
      return { message: "全員の投票が完了するまで次へ進めません。" };
  }
  if (isResultStep(current) && !hasCandidateNotes(ctx.sql, current.phase))
    return { message: "候補がないため次のフェーズへ進めません。" };
  const next = nextRoomPhase(current);
  if (
    isVotingStep(next) &&
    current.step !== 2 &&
    !hasCandidateNotes(ctx.sql, current.phase)
  )
    return { message: "この操作を行う権限がありません。" };
  // 次のステップが無い状態では nextRoomPhase が current をそのまま返す。
  // ここで no-op を配信すると、クライアントの decision 表示がフェーズ単位で
  // 無条件クリアされてしまう（DB上の decision は残るため、再接続時の snapshot
  // で復活し不整合になる）。
  if (next === current) return { message: null };
  // フェーズ境界を越えるときは、現在フェーズの決定が確定していることを
  // 要求する（fail-closed）。
  if (
    !isLobby(next) &&
    current.phase !== next.phase &&
    !getDecision(ctx.sql, current.phase)
  )
    return { message: "決定が確定するまで次のフェーズへ進めません。" };
  return null;
}

async function startAdvanceNotice(
  ctx: Pick<HandlerCtx, "sql" | "storage" | "broadcaster">,
  trigger: AdvanceNotice["trigger"],
  initiatorUserId: string | null,
): Promise<void> {
  const durationMs =
    trigger === "timer" ? ADVANCE_NOTICE_TIMEOUT_MS : ADVANCE_NOTICE_MS;
  const now = Date.now();
  const notice: AdvanceNotice = {
    noticeId: crypto.randomUUID(),
    phaseRevision: getPhaseRevision(ctx.sql),
    trigger,
    initiatorUserId,
    endsAt: now + durationMs,
    durationMs,
  };
  saveAdvanceNotice(ctx.sql, notice);
  await syncRoomAlarm(ctx.storage, ctx.sql);
  ctx.broadcaster.broadcastToAll({
    type: "phase:notice",
    notice,
    serverNow: now,
  });
}

async function cancelAdvanceNotice(
  ctx: Pick<HandlerCtx, "sql" | "storage" | "broadcaster">,
  reason?: AdvanceNoticeEndReason,
): Promise<void> {
  if (!clearAdvanceNotice(ctx.sql)) return;
  await syncRoomAlarm(ctx.storage, ctx.sql);
  if (reason) broadcastAdvanceNotice(ctx.broadcaster, null, reason);
}

// 予告を、いまの共有状態に合わせる。クライアントの操作・接続の増減・alarm の
// たびに呼び、次を1か所で決める。
// - 条件を満たさなくなった予告、延長された時間切れの予告、見る人がいない予告を消す
// - 最後の1票で全員の投票がそろった時（votesJustCompleted）に予告を出す。
//   接続中が1人なら予告なしで進める
// - 時間切れで、工程固有の条件を満たしていれば予告を出す（共有の工程を除く）
// 工程を進めたときは true を返す。
export async function reconcileAdvanceNotice(
  ctx: HandlerCtx,
  options: { votesJustCompleted?: boolean } = {},
): Promise<boolean> {
  const phase = getPhase(ctx.sql);
  const connected = listConnectedMemberIds(ctx.sql, ctx.broadcaster);
  const timer = getTimerState(ctx.sql);
  const blocked = getAdvanceBlock(ctx, phase) !== null;
  const notice = getAdvanceNotice(ctx.sql);
  if (notice) {
    // 全員が切断した予告は、知らせる相手がいないので理由を配らずに消す。
    if (connected.length === 0 || isRoomClosed(ctx.sql))
      await cancelAdvanceNotice(ctx);
    else if (notice.trigger === "timer" && timer.status !== "ended")
      await cancelAdvanceNotice(ctx, "extended");
    // 押した人がルームから外れたら、その人の要求は取り下げたものとして扱う。
    else if (
      notice.initiatorUserId !== null &&
      !isMember(ctx.sql, notice.initiatorUserId)
    )
      await cancelAdvanceNotice(ctx, "withdrawn");
    else if (blocked) await cancelAdvanceNotice(ctx, "unmet");
    else return false;
  }
  if (blocked || connected.length === 0 || phase.kind !== "step") return false;
  if (
    options.votesJustCompleted &&
    isVotingStep(phase) &&
    !isVotesNoticeHeld(ctx.sql, getPhaseRevision(ctx.sql))
  ) {
    if (connected.length === 1)
      return commitAdvance(ctx, phase, getPhaseRevision(ctx.sql));
    await startAdvanceNotice(ctx, "votes", null);
    return false;
  }
  // 共有の時間切れは発表者の交代に使う（sharing.ts）。工程は進めない。
  if (timer.status === "ended" && phase.step !== 2)
    await startAdvanceNotice(ctx, "timer", null);
  return false;
}

// 予告の時間が過ぎていれば、通常の進行と同じ確定前検査を通して工程を進める。
export async function completeDueAdvanceNotice(
  ctx: HandlerCtx,
  now: number = Date.now(),
): Promise<boolean> {
  const notice = getAdvanceNotice(ctx.sql);
  if (!notice || notice.endsAt > now) return false;
  const phase = getPhase(ctx.sql);
  // 切断の通知が届かないまま誰もいなくなったルームは進めない（reconcile と同じ決まり）。
  if (listConnectedMemberIds(ctx.sql, ctx.broadcaster).length === 0) {
    await cancelAdvanceNotice(ctx);
    return false;
  }
  if (
    notice.phaseRevision !== getPhaseRevision(ctx.sql) ||
    getAdvanceBlock(ctx, phase) !== null
  ) {
    await cancelAdvanceNotice(ctx, "unmet");
    return false;
  }
  const committed = await commitAdvance(ctx, phase, notice.phaseRevision);
  // 確定できなかった予告を残すと alarm が繰り返されるので、必ず消す。
  if (!committed) await cancelAdvanceNotice(ctx, "unmet");
  return committed;
}

// 次のステップへの移行を確定する。付箋の掃除・遷移・タイマー停止・予告の消去を
// 同じストレージトランザクションで行う。呼び出し元は getAdvanceBlock を通して
// から呼ぶ（current はステップで、進む先がある）。
async function commitAdvance(
  ctx: HandlerCtx,
  current: RoomPhase,
  expectedRevision: number,
): Promise<boolean> {
  if (current.kind !== "step") return false;
  const next = nextRoomPhase(current);
  if (next.kind !== "step" || next === current) return false;
  const crossesPhaseBoundary = !isLobby(next) && current.phase !== next.phase;
  const entersVotingStep = !isVotingStep(current) && isVotingStep(next);
  const initializesIdeaMapSize =
    current.kind === "step" &&
    current.phase === 3 &&
    next.kind === "step" &&
    next.phase === 3 &&
    ((current.step === 1 && next.step === 2) ||
      (current.step === 2 && next.step === 3));
  const entersIdeaMapStep =
    next.kind === "step" &&
    next.phase === 3 &&
    next.step === 2 &&
    !(current.kind === "step" && current.phase === 3 && current.step === 2);
  // 投票終了時点の結果で候補整理を行う。
  const completesVoting = isVotingStep(current) && isResultStep(next);
  const refreshesSnapshot =
    (!isResultStep(current) && isResultStep(next)) ||
    crossesPhaseBoundary ||
    current.step === 2 ||
    entersVotingStep ||
    entersIdeaMapStep ||
    (next.kind === "step" && next.step === 2);
  let timerWasReset = false;
  let automaticExclusion:
    | { operationId: string; targets: NoteRow[] }
    | undefined;
  let discardedEmptySharedNotes = false;
  // 付箋の掃除・遷移・タイマー停止を同じストレージトランザクションで
  // 確定する。途中失敗時に一部だけが次ステップの状態にならないようにする。
  const committed = await runAuthorizedMutationTransaction(ctx, async () => {
    // 確定の直前にもう一度、工程・更新番号・工程固有の条件を検査する。
    if (
      getPhaseRevision(ctx.sql) !== expectedRevision ||
      encodePhase(getPhase(ctx.sql)) !== encodePhase(current) ||
      getAdvanceBlock(ctx, current) !== null
    ) {
      replyForbidden(ctx);
      return false;
    }
    captureRollbackCheckpoint(ctx.sql, current);
    if (current.phase === 1 && current.step === 3) {
      finalizeGrouping(ctx.storage);
    }
    recordProgressTransition(ctx.sql, current, next, "next");
    discardedEmptySharedNotes = discardEmptySharedNotes(ctx.sql, current.phase);
    if (
      current.kind === "step" &&
      (current.step === 1 || current.step === 2) &&
      next.kind === "step" &&
      next.phase === current.phase &&
      next.step > current.step
    ) {
      discardEmptyPrivateNotes(ctx.sql, current.phase);
    }
    if (crossesPhaseBoundary) {
      discardPrivateNotes(ctx.sql);
    }
    if (initializesIdeaMapSize) {
      const initializedRow = ctx.sql
        .exec("SELECT idea_map_size_initialized FROM room_state WHERE id = 1")
        .toArray()[0] as { idea_map_size_initialized: number } | undefined;
      if (initializedRow?.idea_map_size_initialized !== 1) {
        // 初回共有は本文付き下書き、旧ルームの未初期化評価は共有済み案を基準にする。
        const count = ctx.sql
          .exec(
            "SELECT content FROM notes WHERE phase = 3 AND visibility = ?1",
            current.step === 1 ? "private" : "shared",
          )
          .toArray()
          .filter(({ content }) => String(content).trim() !== "").length;
        const sizeLevel = getInitialIdeaMapSizeLevel(count);
        ctx.sql.exec(
          "UPDATE room_state SET idea_map_size_level = ?1, idea_map_size_initialized = 1 WHERE id = 1",
          sizeLevel,
        );
      }
    }
    if (completesVoting) {
      const targets = listAutomaticExclusionCandidates(ctx.sql, current.phase);
      if (targets.length > 0) {
        const operationId = crypto.randomUUID();
        excludeNotesForBulkOperation(
          ctx.sql,
          targets.map(({ id }) => id),
          operationId,
          new Date().toISOString(),
        );
        automaticExclusion = { operationId, targets };
      }
    }
    savePhase(ctx.sql, next);
    ctx.sql.exec("DELETE FROM pending_phase_transition WHERE id = 1");
    // 共有へ進んだら誰かの開始操作を待たず、1人目の発表を予約する。
    resetSharingForPhase(ctx.sql, next, true);
    if (crossesPhaseBoundary) {
      clearUsedNoteDragIds(ctx.sql);
    }
    timerWasReset = resetTimerState(ctx.sql);
    await syncRoomAlarm(ctx.storage, ctx.sql);
    return true;
  });
  if (!committed) return false;
  ctx.broadcaster.retireAllActiveDrags();
  if (ctx.broadcaster.retireAllAdoptionFocus()) {
    ctx.broadcaster.broadcastToAll({
      type: "adoption-focus:updated",
      noteId: null,
    });
  }
  // 投票ステップでは note:updated の count を秘匿しているため、結果ステップ
  // へ遷移した接続中の参加者にも完全な投票集計を届け直す。フェーズ境界を
  // 越えるときも、持ち越し（carryovers）を含む最新 snapshot を再送してから
  // phase:updated を配る。マイ付箋を破棄したときも、破棄をクライアントへ
  // 伝える経路は snapshot の再送しかない（note:deleted は配信しない）。
  if (refreshesSnapshot || discardedEmptySharedNotes) {
    ctx.refreshSnapshots();
  } else if (timerWasReset) {
    ctx.broadcaster.broadcastToAll({
      type: "timer:updated",
      timer: getTimerState(ctx.sql),
      serverNow: Date.now(),
    });
  }
  if (automaticExclusion) {
    ctx.broadcaster.broadcastToAll({
      type: "note:bulk-excluded",
      operationId: automaticExclusion.operationId,
      count: automaticExclusion.targets.length,
      source: "phase-transition",
    });
  }
  ctx.broadcaster.broadcastToAll({
    type: "phase:updated",
    groupRevision: Number(
      ctx.sql.exec("SELECT group_revision FROM room_state WHERE id=1").one()
        .group_revision,
    ),
    mapRevision: Number(
      ctx.sql.exec("SELECT map_revision FROM room_state WHERE id=1").one()
        .map_revision,
    ),
    phase: next,
    ...(isAdditionalWriting(ctx.sql, next)
      ? { isAdditionalWriting: true }
      : {}),
    phaseRevision: getPhaseRevision(ctx.sql),
    rollbackTarget: getRollbackTarget(ctx.sql),
  });
  return true;
}

// フェーズ進行は在籍者が行える。
export const phaseHandlers: MessageHandlers<
  | "start_phase"
  | "phase:next"
  | "phase:hold"
  | "phase:ready"
  | "phase:restart-writing"
  | "phase:revote"
> = {
  // ロビー → Step 1-1（ボード開始）。在籍メンバーが開始できる。
  start_phase: (ctx, _message) => {
    if (!isLobby(getPhase(ctx.sql))) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "すでに開始済みです。",
      });
      return;
    }
    const firstStep: RoomPhase = { kind: "step", phase: 1, step: 1 };
    ctx.storage.transactionSync(() => {
      recordProgressTransition(ctx.sql, getPhase(ctx.sql), firstStep, "next");
      savePhase(ctx.sql, firstStep);
    });
    ctx.broadcaster.broadcastToAll({
      type: "phase:updated",
      groupRevision: Number(
        ctx.sql.exec("SELECT group_revision FROM room_state WHERE id=1").one()
          .group_revision,
      ),
      mapRevision: Number(
        ctx.sql.exec("SELECT map_revision FROM room_state WHERE id=1").one()
          .map_revision,
      ),
      phase: firstStep,
      phaseRevision: getPhaseRevision(ctx.sql),
      rollbackTarget: getRollbackTarget(ctx.sql),
    });
  },

  // 完了の表明は廃止した（ADR 0037）。開いたままの旧クライアントが送っても
  // 状態を変えず、エラーも返さない。
  "phase:ready": () => {},

  // 現在のステップ → 次のステップ。工程固有の条件を満たしていれば誰でも送れる。
  // 接続中が2人以上なら予告を始め、1人なら予告なしで進める。
  "phase:next": async (ctx, message) => {
    const current = getPhase(ctx.sql);
    if (!matchesExpectedPhase(ctx, message)) {
      replyForbidden(ctx);
      return;
    }
    const blocked = getAdvanceBlock(ctx, current);
    if (blocked) {
      // 最終ステップなど進む先が無いときは、何も配らずに終える。
      if (blocked.message)
        ctx.reply({
          type: "error",
          code: "forbidden",
          message: blocked.message,
        });
      return;
    }
    // 予告中の2回目は予告を作り直さない（残り時間を延ばさない）。
    if (getAdvanceNotice(ctx.sql)) return;
    if (listConnectedMemberIds(ctx.sql, ctx.broadcaster).length <= 1) {
      await commitAdvance(ctx, current, message.expectedRevision);
      return;
    }
    // 前段の非同期待機の間に期限・在籍が失われた要求では、予告を始めない。
    if (ctx.authorizeMutation?.() === false) {
      ctx.broadcaster.authorize(ctx.ws);
      return;
    }
    await startAdvanceNotice(ctx, "member", ctx.userId);
  },

  // 予告の取り消し。「まって！」と、押した本人の「やめる」が同じ要求を送る。
  "phase:hold": async (ctx, message) => {
    const notice = getAdvanceNotice(ctx.sql);
    // 時間切れの予告は「＋1分」（timer:extend）でだけ止められる。
    if (
      !notice ||
      notice.noticeId !== message.noticeId ||
      notice.trigger === "timer"
    ) {
      replyForbidden(ctx);
      return;
    }
    if (ctx.authorizeMutation?.() === false) {
      ctx.broadcaster.authorize(ctx.ws);
      return;
    }
    ctx.storage.transactionSync(() => {
      clearAdvanceNotice(ctx.sql);
      if (notice.trigger === "votes")
        holdVotesNotice(ctx.sql, notice.phaseRevision);
    });
    await syncRoomAlarm(ctx.storage, ctx.sql);
    // 止めた人は配らない。押した本人がやめたことだけは理由で区別する。
    broadcastAdvanceNotice(
      ctx.broadcaster,
      null,
      notice.initiatorUserId === ctx.userId ? "withdrawn" : "held",
    );
  },
  "phase:restart-writing": (ctx, message) => restartPhase(ctx, message, false),
  "phase:revote": (ctx, message) => restartPhase(ctx, message, true),
};

// 両ループも通常の前進と同じ権威状態・競合チェックで確定する。
async function restartPhase(
  ctx: HandlerCtx,
  message: Extract<
    ClientMessage,
    { type: "phase:restart-writing" | "phase:revote" }
  >,
  revote: boolean,
): Promise<void> {
  const current = getPhase(ctx.sql);
  if (
    !matchesExpectedPhase(ctx, message) ||
    current.kind !== "step" ||
    getDecision(ctx.sql, current.phase) ||
    (revote
      ? !isResultStep(current) || !hasCandidateNotes(ctx.sql, current.phase)
      : !isRestartWritingAllowedStep(current))
  ) {
    replyForbidden(ctx);
    return;
  }
  const next: RoomPhase = {
    ...current,
    step: revote ? VOTING_STEP_BY_PHASE[current.phase] : 1,
  };
  if (isRoomClosed(ctx.sql) || !matchesExpectedPhase(ctx, message)) {
    replyForbidden(ctx);
    return;
  }
  const committed = ctx.storage.transactionSync(() => {
    if (ctx.authorizeMutation?.() === false) return false;
    clearRollbackHistory(ctx.sql);
    if (!revote && isPhaseStep(current, 1, 3)) finalizeGrouping(ctx.storage);
    recordProgressTransition(
      ctx.sql,
      current,
      next,
      revote ? "revote" : "restart-writing",
    );
    if (revote) {
      ctx.sql.exec(
        "DELETE FROM note_vote_stickers WHERE note_id IN (SELECT id FROM notes WHERE phase = ?1)",
        current.phase,
      );
      ctx.sql.exec(
        "DELETE FROM note_votes WHERE note_id IN (SELECT id FROM notes WHERE phase = ?1)",
        current.phase,
      );
    }
    savePhase(ctx.sql, next);
    ctx.sql.exec("DELETE FROM pending_phase_transition WHERE id = 1");
    resetSharingForPhase(ctx.sql, next);
    resetTimerState(ctx.sql);
    return true;
  });
  if (!committed) {
    ctx.broadcaster.authorize(ctx.ws);
    return;
  }
  ctx.broadcaster.retireAllActiveDrags();
  ctx.broadcaster.retireAllAdoptionFocus();
  // 共有の交代待機中はtimerがidleでも開始予約がある。
  await syncRoomAlarm(ctx.storage, ctx.sql);
  ctx.refreshSnapshots();
  ctx.broadcaster.broadcastToAll({
    type: "phase:updated",
    groupRevision: Number(
      ctx.sql.exec("SELECT group_revision FROM room_state WHERE id=1").one()
        .group_revision,
    ),
    mapRevision: Number(
      ctx.sql.exec("SELECT map_revision FROM room_state WHERE id=1").one()
        .map_revision,
    ),
    phase: next,
    ...(isAdditionalWriting(ctx.sql, next)
      ? { isAdditionalWriting: true }
      : {}),
    phaseRevision: getPhaseRevision(ctx.sql),
    rollbackTarget: getRollbackTarget(ctx.sql),
  });
}
