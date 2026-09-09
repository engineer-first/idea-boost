// ルーム内の付箋（Note）配列に対して、RoomDO から届く ServerMessage
// （contracts/room-protocol.ts）を適用する純粋関数群。
//
// 「自分がドラッグ中の付箋」については、他クライアント（＝自分自身のエコーを含む）
// からの位置更新を無視し、ローカルの操作を優先する。そうしないと、ドラッグ中に
// 古い位置を運ぶ note:updated/note:drag イベントを受信した瞬間に付箋が
// 巻き戻って見えてしまう。
//
// メンバー参加・進行状態などノート以外のメッセージは、members / phase を
// 別リデューサで扱うため、ここでは notes をそのまま返す（既定挙動）。
import {
  DOT_VOTE_LIMITS,
  type DotVoteKind,
  type ProtocolNote,
  type ServerMessage,
} from "@/contracts/room-protocol";

// アプリケーションで扱うドメインモデル。プロトコル上の付箋と同一の形なので
// contracts の型をそのまま再エクスポートする（重複定義を避ける）。
export type Note = ProtocolNote;

export type ApplyServerMessageOptions = {
  // 現在ローカルでドラッグ操作中の付箋ID（ドラッグしていなければ null）。
  draggingNoteId: string | null;
};

export function applyServerMessage(
  notes: Note[],
  message: ServerMessage,
  options: ApplyServerMessageOptions,
): Note[] {
  switch (message.type) {
    case "snapshot": {
      // 接続・再接続時の一括復元。確定状態はサーバーが真実なので、
      // ドラッグ中でも丸ごと置き換える。
      return message.notes;
    }

    case "note:inserted": {
      const exists = notes.some((n) => n.id === message.note.id);
      if (!exists) {
        return [...notes, message.note];
      }
      return notes.map((n) => (n.id === message.note.id ? message.note : n));
    }

    case "note:updated": {
      return notes.map((n) => {
        if (n.id !== message.note.id) {
          return n;
        }
        const note = {
          ...message.note,
          dotVotes: mergeLocalDotVotes(n.dotVotes, message.note.dotVotes),
        };
        if (options.draggingNoteId === n.id) {
          // 自分がドラッグ中の位置はローカル優先で保持し、他フィールドのみ反映する。
          return { ...note, x: n.x, y: n.y };
        }
        return note;
      });
    }

    case "note:deleted": {
      return notes.filter((n) => n.id !== message.noteId);
    }

    case "note:drag": {
      if (options.draggingNoteId === message.noteId) {
        // 自分自身のドラッグ操作を優先し、エコーを無視する。
        return notes;
      }
      return notes.map((n) =>
        n.id === message.noteId ? { ...n, x: message.x, y: message.y } : n,
      );
    }

    case "member_joined":
    case "member_left":
    case "phase:updated":
    case "timer:updated":
    case "group:updated":
    case "group:deleted":
    case "decision:updated":
    case "cursor:updated":
    case "cursor:left":
    case "error": {
      // ノート以外の状態は別リデューサが担当する（room-reducer.ts）。
      // グループ・フェーズの同期は RoomBoard 側で管理するため、ここでは付箋状態を変えない。
      // 通知・ログはコンテナ（room-board.tsx）の責務。ここでは notes に触れない。
      return notes;
    }

    default: {
      const _exhaustive: never = message;
      return _exhaustive;
    }
  }
}

function mergeLocalDotVotes(
  current: Note["dotVotes"],
  incoming: Note["dotVotes"],
): Note["dotVotes"] {
  return {
    subjective: mergeLocalDotVote(current.subjective, incoming.subjective),
    objective: mergeLocalDotVote(current.objective, incoming.objective),
  };
}

function mergeLocalDotVote(
  current: Note["dotVotes"][DotVoteKind],
  incoming: Note["dotVotes"][DotVoteKind],
): Note["dotVotes"][DotVoteKind] {
  if (current.ownCount <= incoming.ownCount) {
    return incoming;
  }

  if (incoming.count === undefined) {
    const projected = {
      ...incoming,
      votedByMe: true,
      ownCount: current.ownCount,
    };
    delete projected.count;
    return projected;
  }

  return {
    count: incoming.count + current.ownCount - incoming.ownCount,
    votedByMe: true,
    ownCount: current.ownCount,
  };
}

// 自分自身のドラッグ操作をローカルへ即時反映するための純粋関数。
// サーバーへの確定（note:move）を待たず、操作の追従性を優先する。
export function moveNoteLocally(
  notes: Note[],
  noteId: string,
  x: number,
  y: number,
): Note[] {
  return notes.map((n) => (n.id === noteId ? { ...n, x, y } : n));
}

export type LocalVoteResult = {
  notes: Note[];
  accepted: boolean;
};

function countOwnVotes(notes: Note[], kind: DotVoteKind): number {
  return notes.reduce((count, note) => count + note.dotVotes[kind].ownCount, 0);
}

export function voteNoteLocally(
  notes: Note[],
  noteId: string,
  kind: DotVoteKind,
): LocalVoteResult {
  const target = notes.find((note) => note.id === noteId);
  if (!target) {
    return { notes, accepted: false };
  }

  const summary = target.dotVotes[kind];
  if (kind === "subjective" && summary.ownCount > 0) {
    return resetNoteVoteLocally(notes, noteId, kind);
  }

  if (countOwnVotes(notes, kind) >= DOT_VOTE_LIMITS[kind]) {
    return { notes, accepted: false };
  }

  return {
    accepted: true,
    notes: notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            dotVotes: {
              ...note.dotVotes,
              [kind]: {
                ...withUpdatedCount(summary, (summary.count ?? 0) + 1),
                votedByMe: true,
                ownCount: summary.ownCount + 1,
              },
            },
          }
        : note,
    ),
  };
}

export function resetNoteVoteLocally(
  notes: Note[],
  noteId: string,
  kind: DotVoteKind,
): LocalVoteResult {
  const target = notes.find((note) => note.id === noteId);
  if (!target) {
    return { notes, accepted: false };
  }

  const summary = target.dotVotes[kind];
  if (summary.ownCount <= 0) {
    return { notes, accepted: false };
  }

  return {
    accepted: true,
    notes: notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            dotVotes: {
              ...note.dotVotes,
              [kind]: {
                ...withUpdatedCount(
                  summary,
                  Math.max(0, (summary.count ?? 0) - summary.ownCount),
                ),
                votedByMe: false,
                ownCount: 0,
              },
            },
          }
        : note,
    ),
  };
}

function withUpdatedCount(
  summary: Note["dotVotes"][DotVoteKind],
  count: number,
): Pick<Note["dotVotes"][DotVoteKind], "count"> | Record<string, never> {
  return summary.count === undefined ? {} : { count };
}
