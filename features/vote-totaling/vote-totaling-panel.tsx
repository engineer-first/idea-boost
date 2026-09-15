import {
  type Decision,
  DOT_VOTE_LIMITS,
  type ProtocolMember,
  type ProtocolNote,
} from "@/contracts/room-protocol";
import type { VoteTotalingRowViewModel } from "./vote-totaling-row";
import { VoteTotalingRow } from "./vote-totaling-row";

const SUBJECTIVE_POINT = 5;
const OBJECTIVE_POINT = 1;

export type VoteTotalingResult = {
  isComplete: boolean;
  rows: VoteTotalingRowViewModel[];
};

function publicVoteCount(count: number | undefined): number {
  return count ?? 0;
}

export function calculateVoteTotaling({
  notes,
  memberCount,
  isVotingComplete,
}: {
  notes: ProtocolNote[];
  memberCount: number;
  isVotingComplete?: boolean;
}): VoteTotalingResult {
  const subjective = notes.reduce(
    (total, note) => total + publicVoteCount(note.dotVotes.subjective.count),
    0,
  );
  const objective = notes.reduce(
    (total, note) => total + publicVoteCount(note.dotVotes.objective.count),
    0,
  );
  const allMembersCompletedVoting =
    memberCount > 0 &&
    subjective === memberCount * DOT_VOTE_LIMITS.subjective &&
    objective === memberCount * DOT_VOTE_LIMITS.objective;
  const isComplete = isVotingComplete ?? allMembersCompletedVoting;
  const rows = notes
    .map((note) => ({
      noteId: note.id,
      content: note.content,
      subjectiveCount: publicVoteCount(note.dotVotes.subjective.count),
      objectiveCount: publicVoteCount(note.dotVotes.objective.count),
      score:
        publicVoteCount(note.dotVotes.subjective.count) * SUBJECTIVE_POINT +
        publicVoteCount(note.dotVotes.objective.count) * OBJECTIVE_POINT,
    }))
    .filter((row) => row.subjectiveCount + row.objectiveCount > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.subjectiveCount - a.subjectiveCount ||
        a.noteId.localeCompare(b.noteId),
    );
  return {
    isComplete,
    rows,
  };
}

export function VoteTotalingPanel({
  notes,
  members,
  isVotingComplete,
  decision,
  isHost,
  isDisconnected,
  onNoteDecide,
}: {
  notes: ProtocolNote[];
  members: ProtocolMember[];
  // phase4 への遷移時に RoomDO が投票完了を保証する。以後にメンバーが
  // 退出しても、確定済み結果を待機状態へ戻さないための明示的な状態。
  isVotingComplete?: boolean;
  decision: Decision | null;
  isHost: boolean;
  isDisconnected: boolean;
  onNoteDecide: (noteId: string) => void;
}) {
  const result = calculateVoteTotaling({
    notes,
    memberCount: members.length,
    isVotingComplete,
  });
  if (!result.isComplete) {
    return (
      <section
        className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-background p-5 text-center"
        aria-label="投票結果"
      >
        <h2 className="font-semibold">投票結果</h2>
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          全員の投票完了を待っています
        </p>
      </section>
    );
  }
  return (
    <section
      className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-background p-5 shadow-sm sm:p-8"
      aria-label="投票結果"
      data-testid="vote-result-ranking"
    >
      <div className="text-center">
        <h2 className="text-xl font-bold">投票結果</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          総合ポイントが高い順
        </p>
      </div>
      <ol className="mt-6 grid gap-3">
        {result.rows.map((row, _index, ranking) => {
          const rank =
            ranking.findIndex(
              (candidate) =>
                candidate.score === row.score &&
                candidate.subjectiveCount === row.subjectiveCount,
            ) + 1;
          return (
            <VoteTotalingRow
              key={row.noteId}
              row={row}
              rank={rank}
              canDecide={isHost && !isDisconnected}
              isDecided={decision?.noteId === row.noteId}
              onDecide={() => onNoteDecide(row.noteId)}
            />
          );
        })}
      </ol>
    </section>
  );
}
