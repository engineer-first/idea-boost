// 可視性ルールの一点集約。
// スナップショットの絞り込みも配信の宛先判定も、必ずこの関数を通る
// （push 型の可視性制御は「送らないコード」の正しさが全てなので、
// 判定ロジックの分散を構造的に禁止する）。
//
// private の付箋は作者だけ、shared の付箋はルームメンバー全員に配信する。
import { isVotingStep, type RoomPhase } from "../contracts/phase";
import type { ProtocolNote } from "../contracts/room-protocol";

export type VisibilityContext = {
  viewerId: string;
};

export type NoteProjectionContext = VisibilityContext & {
  phase: RoomPhase;
};

// note は判定が実際に依存するフィールドだけを要求する。
// これにより DB の行形式（NoteRow）からも dotVotes 等の射影を
// 経由せずに呼べ、操作認可の述語（workers/room/notes.ts）も
// この関数に委譲できる。
export function visibleTo(
  context: VisibilityContext,
  note: Pick<ProtocolNote, "visibility" | "authorId">,
): boolean {
  return note.visibility === "shared" || note.authorId === context.viewerId;
}

export function filterVisible(
  context: VisibilityContext,
  notes: ProtocolNote[],
): ProtocolNote[] {
  return notes.filter((note) => visibleTo(context, note));
}

// 可視性判定を通過したノートを、受信者とフェーズに応じたプロトコル形へ
// 非破壊で射影する。viewerId は本人票（votedByMe / ownCount）を維持する
// 受信者向け API の一部として明示的に受け取る。本人票の組み立て自体は
// notes.ts の toProtocolNote が担当し、ここでは公開範囲だけを狭める。
export function projectNoteForViewer(
  _context: NoteProjectionContext,
  note: ProtocolNote,
): ProtocolNote {
  if (!isVotingStep(_context.phase)) {
    return note;
  }

  return {
    ...note,
    dotVotes: {
      subjective: withoutCount(note.dotVotes.subjective),
      objective: withoutCount(note.dotVotes.objective),
    },
  };
}

function withoutCount(
  summary: ProtocolNote["dotVotes"]["subjective"],
): Omit<ProtocolNote["dotVotes"]["subjective"], "count"> {
  const projected = { ...summary };
  delete projected.count;
  return projected;
}
