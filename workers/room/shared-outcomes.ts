import {
  isResultStep,
  isVotingStep,
  RoomPhaseSchema,
} from "../../contracts/phase";
import {
  type SharedOutcomeRecord,
  type SharedOutcomeSnapshot,
  SharedOutcomeSnapshotSchema,
} from "../../contracts/shared-outcomes";
import { filterVisible } from "../visibility";
import { listVisibleGroups } from "./groups";
import { getIdeaMapSizeState } from "./idea-map";
import { listNotes, NULL_VIEWER_ID } from "./notes";
import { getPhase } from "./phase";

export type OutcomeState = {
  room_id: string;
  room_name: string | null;
  display_id: string;
  last_used_at: number;
  expires_at: number;
  phase_json: string;
  confirmed: number;
  pending_json: string | null;
  saved_json: string | null;
  last_saved_at: number | null;
  save_status: "saved" | "pending" | "failed";
  retry_at: number | null;
  disbanded: number;
};
export function readOutcomeState(sql: SqlStorage): OutcomeState | null {
  return (
    sql
      .exec<OutcomeState>(
        "SELECT s.*, i.room_id, i.room_name, i.display_id, i.disbanded FROM shared_outcome_state s JOIN shared_outcome_identity i ON i.id=s.id WHERE s.id = 1",
      )
      .toArray()[0] ?? null
  );
}
export function captureSharedOutcome(
  sql: SqlStorage,
  now: number,
): SharedOutcomeSnapshot {
  const decisions = sql
    .exec<{ phase: number; note_id: string; note_content: string }>(
      "SELECT phase, note_id, note_content FROM decisions ORDER BY phase",
    )
    .toArray();
  const current = getPhase(sql);
  const decidedPhases = new Set(decisions.map((row) => row.phase));
  const notes = [1, 2, 3].flatMap((phase) =>
    filterVisible(
      { viewerId: NULL_VIEWER_ID },
      listNotes(sql, NULL_VIEWER_ID, phase),
    )
      .filter((note) => note.visibility === "shared")
      .map((note) => ({ ...note, phase })),
  );
  const votes = (note: (typeof notes)[number]) => ({
    subjective: note.dotVotes.subjective.count ?? 0,
    objective: note.dotVotes.objective.count ?? 0,
  });
  return SharedOutcomeSnapshotSchema.parse({
    capturedAt: now,
    phase: getPhase(sql),
    decisions: decisions.map((row) => {
      const note = notes.find((n) => n.id === row.note_id);
      return {
        phase: row.phase,
        noteId: row.note_id,
        content: row.note_content,
        votes: note ? votes(note) : { subjective: 0, objective: 0 },
      };
    }),
    notes: notes.map((note) => ({
      id: note.id,
      content: note.content,
      phase: note.phase,
      x: note.x,
      y: note.y,
      color: note.color,
      fontSize: note.fontSize,
      stackOrder: note.stackOrder,
      excluded: note.excluded,
      votes:
        current.kind === "step" &&
        current.phase === note.phase &&
        isVotingStep(current)
          ? null
          : decidedPhases.has(note.phase) ||
              (current.kind === "step" &&
                current.phase === note.phase &&
                isResultStep(current))
            ? votes(note)
            : null,
    })),
    groups: listVisibleGroups(sql, NULL_VIEWER_ID).map(
      ({ id, name, noteIds }) => ({ id, name, noteIds }),
    ),
    ideaMapSizeLevel: getIdeaMapSizeState(sql).sizeLevel,
  });
}
export function outcomeRecord(row: OutcomeState): SharedOutcomeRecord {
  return {
    roomId: row.room_id,
    name: row.room_name,
    displayId: row.display_id,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    phase: RoomPhaseSchema.parse(JSON.parse(row.phase_json)),
    status: row.confirmed ? "confirmed" : "partial",
    saveStatus: row.save_status,
    lastSavedAt: row.last_saved_at,
    snapshot: row.saved_json
      ? SharedOutcomeSnapshotSchema.parse(JSON.parse(row.saved_json))
      : null,
  };
}
