// 進行状態（lobby / 課題整理のステップ）の真実と、進行操作・境界ゲート。
import {
  getInitialIdeaMapSizeLevel,
  isIdeaValueFeasibilityMapCoordinate,
} from "../../contracts/board";
import {
  getRoomPhaseLabel,
  isLobby,
  isRestartWritingAllowedStep,
  isResultStep,
  isVotingStep,
  type PHASE_STEP_COUNTS,
  type RoomPhase,
  RoomPhaseSchema,
  VOTING_STEP_BY_PHASE,
} from "../../contracts/phase";
import type { ClientMessage } from "../../contracts/room-protocol";
import { getDecision } from "./decisions";
import { clearUsedNoteDragIds } from "./drag-operations";
import {
  type HandlerCtx,
  type MessageHandlers,
  replyForbidden,
} from "./handler-context";
import { isHostUser } from "./members";
import {
  excludeNotesForBulkOperation,
  hasCandidateNotes,
  listAutomaticExclusionCandidates,
  type NoteRow,
} from "./notes";
import { resetTimerState } from "./timer";
import { haveAllMembersCompletedVoting } from "./votes";

export function getPhase(sql: SqlStorage): RoomPhase {
  const rows = sql.exec("SELECT phase FROM room_state WHERE id = 1").toArray();
  const row = rows[0] as { phase: string } | undefined;
  return decodePhase(row?.phase ?? "lobby");
}

export function savePhase(sql: SqlStorage, phase: RoomPhase): void {
  sql.exec(
    "UPDATE room_state SET phase = ?1, phase_revision = phase_revision + 1 WHERE id = 1",
    encodePhase(phase),
  );
}

export function getPhaseRevision(sql: SqlStorage): number {
  return Number(
    sql.exec("SELECT phase_revision FROM room_state WHERE id = 1").one()
      .phase_revision,
  );
}

function matchesExpectedPhase(
  ctx: HandlerCtx,
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

// 個人執筆ステップ（各フェーズの Step 1: 課題 / HMW / アイデアを個人で書く）
// かどうか。これらのステップでは変更してよいのは自分の private 付箋だけで、
// 前フェーズから残る共有付箋は記録として凍結する。共有ステップの
// 「共有付箋は全員で修正できる」認可（note-handlers の canEdit）が
// 個人執筆ステップへ漏れ込まないよう、ハンドラ側がこの述語で visibility を
// 追加検証する。
export function isPersonalWritingStep(phase: RoomPhase): boolean {
  return !isLobby(phase) && phase.step === 1;
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
    case "cursor:update":
    case "cursor:leave":
    case "adoption-focus:update":
    case "start_phase":
    case "phase:next":
    case "phase:restart-writing":
    case "phase:revote":
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
      "note:move",
      "note:bring-to-front",
      "note:drag:start",
      "note:drag:move",
      "note:drag:end",
    ],
  },
  2: {
    // Step 2-1（HMW 個人執筆）は自分専用付箋の作成・編集・削除だけ。
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
    ],
    4: [
      "note:exclude",
      "note:restore",
      "note:bulk-exclude",
      "note:bulk-restore",
      "note:decide",
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

// フェーズ進行の認可は room_owner（isHostUser）に一本化している。
// D1 由来の hostId ヘッダーを認可ソースに加えない（旧ルームのバックフィル
// シードにすぎない。room-do.ts の HOST_ID_HEADER 参照）。
export const phaseHandlers: MessageHandlers<
  "start_phase" | "phase:next" | "phase:restart-writing" | "phase:revote"
> = {
  // ロビー → Step 1-1（ボード開始）。ホストのみ。
  start_phase: (ctx) => {
    if (!isHostUser(ctx.sql, ctx.userId)) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "進行状態を変更する権限がありません。",
      });
      return;
    }
    if (!isLobby(getPhase(ctx.sql))) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "すでに開始済みです。",
      });
      return;
    }
    const firstStep: RoomPhase = { kind: "step", phase: 1, step: 1 };
    savePhase(ctx.sql, firstStep);
    ctx.broadcaster.broadcastToAll({
      type: "phase:updated",
      phase: firstStep,
      phaseRevision: getPhaseRevision(ctx.sql),
    });
  },

  // 現在のステップ → 次のステップ。ホストのみ。lobby では不可。
  "phase:next": async (ctx, message) => {
    if (!isHostUser(ctx.sql, ctx.userId)) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "ホストのみ操作できます。",
      });
      return;
    }
    const current = getPhase(ctx.sql);
    if (!matchesExpectedPhase(ctx, message)) {
      replyForbidden(ctx);
      return;
    }
    if (isLobby(current)) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "ロビー中は次フェーズに進めません。",
      });
      return;
    }
    if (isResultStep(current) && !hasCandidateNotes(ctx.sql, current.phase)) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "候補がないため次のフェーズへ進めません。",
      });
      return;
    }
    // force はフェーズ1・2の投票ステップで使える脱出ハッチ。離脱者などが
    // 投票を完了できなくても、ホストは結果ステップへ進められる。
    const completedVoting =
      !isVotingStep(current) ||
      haveAllMembersCompletedVoting(ctx.sql, current.phase);
    const canForceIncompleteVoting =
      (current.phase === 1 || current.phase === 2) && message.force === true;
    if (
      isVotingStep(current) &&
      !completedVoting &&
      !canForceIncompleteVoting
    ) {
      ctx.reply({
        type: "error",
        code: "voting-incomplete",
        message: "全員の主観・客観投票が完了していません。",
      });
      return;
    }
    const next = nextRoomPhase(current);
    if (isVotingStep(next) && !hasCandidateNotes(ctx.sql, current.phase)) {
      replyForbidden(ctx);
      return;
    }
    // 次のステップがまだ実装されていない状態では nextRoomPhase が current を
    // そのまま返す。ここで no-op を配信すると
    // クライアントの decision 表示がフェーズ単位で無条件クリアされてしまう
    // （DB上の decision は残るため、再接続時の snapshot で復活し不整合になる）。
    if (next === current) {
      return;
    }
    const crossesPhaseBoundary = !isLobby(next) && current.phase !== next.phase;
    // フェーズ境界を越えるときは、現在フェーズの決定が確定していることを
    // 要求する（fail-closed）。決定なしで次フェーズへ進むと、持ち越し表示の
    // 前提が崩れたまま進行が続いてしまう。force は未投票メンバー向けの
    // 脱出ハッチであり、このゲートは迂回できない。
    if (crossesPhaseBoundary && !getDecision(ctx.sql, current.phase)) {
      ctx.reply({
        type: "error",
        code: "forbidden",
        message: "決定が確定するまで次のフェーズへ進めません。",
      });
      return;
    }
    const entersVotingStep = !isVotingStep(current) && isVotingStep(next);
    const initializesIdeaMapSize =
      current.kind === "step" &&
      current.phase === 3 &&
      current.step === 1 &&
      next.kind === "step" &&
      next.phase === 3 &&
      next.step === 2;
    const entersIdeaMapStep =
      next.kind === "step" &&
      next.phase === 3 &&
      next.step === 2 &&
      !(current.kind === "step" && current.phase === 3 && current.step === 2);
    const completesVoting =
      isVotingStep(current) && isResultStep(next) && completedVoting;
    const refreshesSnapshot =
      (!isResultStep(current) && isResultStep(next)) ||
      crossesPhaseBoundary ||
      current.step === 2 ||
      entersVotingStep ||
      entersIdeaMapStep;
    let timerWasReset = false;
    let automaticExclusion:
      | { operationId: string; targets: NoteRow[] }
      | undefined;
    // 付箋の掃除・遷移・タイマー停止を同じストレージトランザクションで
    // 確定する。途中失敗時に一部だけが次ステップの状態にならないようにする。
    ctx.storage.transactionSync(() => {
      if (crossesPhaseBoundary) {
        discardPrivateNotes(ctx.sql);
      }
      if (initializesIdeaMapSize) {
        const initializedRow = ctx.sql
          .exec("SELECT idea_map_size_initialized FROM room_state WHERE id = 1")
          .toArray()[0] as { idea_map_size_initialized: number } | undefined;
        if (initializedRow?.idea_map_size_initialized !== 1) {
          const countRow = ctx.sql
            .exec(
              "SELECT COUNT(*) AS count FROM notes WHERE phase = 3 AND visibility = 'private'",
            )
            .toArray()[0] as { count: number } | undefined;
          const sizeLevel = getInitialIdeaMapSizeLevel(countRow?.count ?? 0);
          ctx.sql.exec(
            "UPDATE room_state SET idea_map_size_level = ?1, idea_map_size_initialized = 1 WHERE id = 1",
            sizeLevel,
          );
        }
      }
      if (completesVoting) {
        const targets = listAutomaticExclusionCandidates(
          ctx.sql,
          current.phase,
        );
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
      if (crossesPhaseBoundary) {
        clearUsedNoteDragIds(ctx.sql);
      }
      timerWasReset = resetTimerState(ctx.sql);
    });
    ctx.broadcaster.retireAllActiveDrags();
    if (ctx.broadcaster.retireAllAdoptionFocus()) {
      ctx.broadcaster.broadcastToAll({
        type: "adoption-focus:updated",
        noteId: null,
      });
    }
    if (timerWasReset) {
      await ctx.storage.deleteAlarm();
    }
    // 投票ステップでは note:updated の count を秘匿しているため、結果ステップ
    // へ遷移した接続中の参加者にも完全な投票集計を届け直す。フェーズ境界を
    // 越えるときも、持ち越し（carryovers）を含む最新 snapshot を再送してから
    // phase:updated を配る。マイ付箋を破棄したときも、破棄をクライアントへ
    // 伝える経路は snapshot の再送しかない（note:deleted は配信しない）。
    if (refreshesSnapshot) {
      ctx.refreshSnapshots();
    } else if (timerWasReset) {
      ctx.broadcaster.broadcastToAll({
        type: "timer:updated",
        timer: { status: "idle" },
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
      phase: next,
      phaseRevision: getPhaseRevision(ctx.sql),
    });
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
    !isHostUser(ctx.sql, ctx.userId) ||
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
  let timerWasReset = false;
  ctx.storage.transactionSync(() => {
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
    timerWasReset = resetTimerState(ctx.sql);
  });
  ctx.broadcaster.retireAllActiveDrags();
  ctx.broadcaster.retireAllAdoptionFocus();
  if (timerWasReset) await ctx.storage.deleteAlarm();
  ctx.refreshSnapshots();
  ctx.broadcaster.broadcastToAll({
    type: "phase:updated",
    phase: next,
    phaseRevision: getPhaseRevision(ctx.sql),
  });
}
