// ルームの「ノート以外」の状態（メンバー一覧・進行状態・タイマー）に対する純粋関数群。
// ノート (notes) は notes-reducer.ts が担当し、責務を分離する。
//
// 設計:
// - members は参加順を維持する（snapshot.members / member_joined の双方が
//   同じ順序規約に従う前提）。同一 userId の重複は作らない。
// - phase はサーバーが真実を持つ。lobby がデフォルト。
// - timer は serverNow と受信時刻の差でクライアント時計を補正する。

import type { RoomPhase } from "@/contracts/phase";
import type {
  Carryover as ProtocolCarryover,
  Decision as ProtocolDecision,
  ProtocolMember,
  ServerMessage,
  SharingState,
  TimerState,
} from "@/contracts/room-protocol";

export type Member = ProtocolMember;
export type Decision = ProtocolDecision;
export type Carryover = ProtocolCarryover;

export type IdeaMapClientState = {
  sizeLevel: number;
  initialized: boolean;
  isDragging: boolean;
};

export const INITIAL_IDEA_MAP_STATE: IdeaMapClientState = {
  sizeLevel: 0,
  initialized: false,
  isDragging: false,
};

export function applyIdeaMapServerMessage(
  state: IdeaMapClientState,
  message: ServerMessage,
): IdeaMapClientState {
  if (message.type === "snapshot") {
    return {
      sizeLevel: message.ideaMapSizeLevel ?? 0,
      initialized: message.ideaMapSizeInitialized ?? false,
      isDragging: message.ideaMapDragging ?? false,
    };
  }
  if (message.type === "idea-map:state") {
    return {
      sizeLevel: message.sizeLevel,
      initialized: message.initialized,
      isDragging: message.isDragging,
    };
  }
  return state;
}

// snapshot / member_joined / member_left を受けて members state を更新する純粋関数。
// 進行状態メッセージは早期 return。
export function applyMemberServerMessage(
  members: Member[],
  message: ServerMessage,
): Member[] {
  switch (message.type) {
    case "snapshot": {
      return message.members.map((m) => ({
        userId: m.userId,
        name: m.name,
        color: m.color,
      }));
    }
    case "member_joined": {
      const exists = members.some((m) => m.userId === message.member.userId);
      if (exists) {
        // 同一ユーザーの再参加は name を最新化して反映。
        return members.map((m) =>
          m.userId === message.member.userId ? message.member : m,
        );
      }
      return [...members, message.member];
    }
    case "member_left": {
      // 退出者を members から取り除く。
      // サーバ側で broadcastToAllExcept により本人には届かないため、
      // ここで受け取る userId は常に「他人の退出」を意味する。
      return members.filter((m) => m.userId !== message.userId);
    }
    case "member_vote_status":
    case "note:inserted":
    case "note:updated":
    case "note:deleted":
    case "note:bulk-excluded":
    case "note:bulk-restored":
    case "note:drag:result":
    case "idea-map:state":
    case "phase:updated":
    case "sharing:updated":
    case "timer:updated":
    case "group:updated":
    case "group:deleted":
    case "decision:updated":
    case "outcome:published":
    case "adoption-focus:updated":
    case "cursor:updated":
    case "cursor:drag-ended":
    case "cursor:left":
    case "error":
      return members;
    default: {
      const _exhaustive: never = message;
      return _exhaustive;
    }
  }
}

// 投票完了状態は userId の集合だけをサーバーから畳み込む。投票先や票種別の
// 残数はこの state に存在しないため、投票中の秘匿境界を越えない。
export function applyVotingCompletionServerMessage(
  completedVoterIds: string[],
  message: ServerMessage,
): string[] {
  switch (message.type) {
    case "snapshot":
      return message.completedVoterIds;
    case "member_vote_status":
      return message.isComplete
        ? completedVoterIds.includes(message.userId)
          ? completedVoterIds
          : [...completedVoterIds, message.userId]
        : completedVoterIds.filter((userId) => userId !== message.userId);
    case "phase:updated":
      return [];
    case "member_left":
      return completedVoterIds.filter((userId) => userId !== message.userId);
    case "note:inserted":
    case "note:updated":
    case "note:deleted":
    case "note:bulk-excluded":
    case "note:bulk-restored":
    case "note:drag:result":
    case "idea-map:state":
    case "member_joined":
    case "group:updated":
    case "group:deleted":
    case "decision:updated":
    case "outcome:published":
    case "adoption-focus:updated":
    case "sharing:updated":
    case "timer:updated":
    case "cursor:updated":
    case "cursor:drag-ended":
    case "cursor:left":
    case "error":
      return completedVoterIds;
    default: {
      const _exhaustive: never = message;
      return _exhaustive;
    }
  }
}

export type TimerClientState = {
  timer: TimerState;
  serverOffsetMs: number;
  // snapshot は現在状態の復元だけに使い、timer:updated だけをイベントとして数える。
  timerUpdateVersion: number;
};

export function applyTimerServerMessage(
  state: TimerClientState,
  message: ServerMessage,
  clientNow = Date.now(),
): TimerClientState {
  if (
    message.type !== "snapshot" &&
    message.type !== "timer:updated" &&
    message.type !== "sharing:updated"
  ) {
    return state;
  }
  return {
    timer: message.timer,
    serverOffsetMs: message.serverNow - clientNow,
    timerUpdateVersion:
      state.timerUpdateVersion + (message.type !== "snapshot" ? 1 : 0),
  };
}

// 決定状態はフェーズ単位のサーバー権威。snapshot で再接続を復元し、
// フェーズが進んだら前フェーズの決定を表示し続けないようクリアする。
export function applyDecisionServerMessage(
  decision: Decision | null,
  message: ServerMessage,
): Decision | null {
  switch (message.type) {
    case "decision:updated":
      return message.decision;
    case "snapshot":
      return message.decision;
    case "phase:updated":
      return null;
    case "note:inserted":
    case "note:updated":
    case "note:deleted":
    case "note:bulk-excluded":
    case "note:bulk-restored":
    case "note:drag:result":
    case "idea-map:state":
    case "member_joined":
    case "member_left":
    case "member_vote_status":
    case "group:updated":
    case "group:deleted":
    case "sharing:updated":
    case "timer:updated":
    case "outcome:published":
    case "adoption-focus:updated":
    case "cursor:updated":
    case "cursor:drag-ended":
    case "cursor:left":
    case "error":
      return decision;
    default: {
      const _exhaustive: never = message;
      return _exhaustive;
    }
  }
}

export function applyOutcomePublishedServerMessage(
  published: boolean,
  message: ServerMessage,
): boolean {
  if (message.type === "snapshot") return message.outcomePublished ?? false;
  if (message.type === "outcome:published") return true;
  if (message.type === "phase:updated") return false;
  return published;
}

// 採用フォーカスは RoomDO のソケット添付が真実。確定・フェーズ遷移は
// 明示解除との到着順にかかわらず表示を残さない。
export function applyAdoptionFocusServerMessage(
  noteId: string | null,
  message: ServerMessage,
): string | null {
  if (message.type === "snapshot") {
    return message.adoptionFocusNoteId ?? null;
  }
  if (message.type === "adoption-focus:updated") {
    return message.noteId;
  }
  if (message.type === "decision:updated" || message.type === "phase:updated") {
    return null;
  }
  return noteId;
}

// 持ち越し（前フェーズで確定した決定）はサーバー権威で、snapshot だけが
// 真実を運ぶ。decision と違い phase:updated ではクリアしない: フェーズ境界を
// 越える遷移ではサーバーが snapshot を再送するため、そこで置き換わる。
export function applyCarryoverServerMessage(
  carryovers: Carryover[],
  message: ServerMessage,
): Carryover[] {
  if (message.type === "snapshot") return message.carryovers;
  return carryovers;
}

// phase state を更新する純粋関数。phase 以外のメッセージは何もしない。
export function applyPhaseServerMessage(
  phase: RoomPhase,
  message: ServerMessage,
): RoomPhase {
  switch (message.type) {
    case "phase:updated": {
      // start_phase / phase:next の両方で配信される。
      return message.phase;
    }
    case "snapshot": {
      // 再接続時の復帰パス。切断中に進んだ phase もここで取り込む。
      return message.phase;
    }
    case "note:inserted":
    case "note:updated":
    case "note:deleted":
    case "note:bulk-excluded":
    case "note:bulk-restored":
    case "note:drag:result":
    case "idea-map:state":
    case "member_joined":
    case "member_left":
    case "member_vote_status":
    case "group:updated":
    case "group:deleted":
    case "sharing:updated":
    case "timer:updated":
    case "decision:updated":
    case "outcome:published":
    case "adoption-focus:updated":
    case "cursor:updated":
    case "cursor:drag-ended":
    case "cursor:left":
    case "error":
      return phase;
    default: {
      const _exhaustive: never = message;
      return _exhaustive;
    }
  }
}

export function applySharingServerMessage(
  state: SharingState | null,
  message: ServerMessage,
): SharingState | null {
  if (message.type === "snapshot") return message.sharing ?? null;
  if (message.type === "sharing:updated") return message.sharing;
  return state;
}
