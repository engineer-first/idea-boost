// フェーズごとのホスト確定の永続状態。決定はフェーズ番号をキーにし、
// 課題・HMW・アイデアなど個別ドメインの名称を持ち込まない。
// note_content は決定時点のコピー。持ち越し表示を元付箋の後からの
// 編集・削除に影響されない確定情報にするため、参照ではなくコピーで持つ。
import type {
  Carryover,
  Decision as ProtocolDecision,
} from "../../contracts/room-protocol";

export type Decision = ProtocolDecision;

type DecisionRow = {
  phase: number;
  note_id: string;
  decided_by: string;
};

type CarryoverRow = {
  phase: number;
  note_id: string;
  note_content: string;
};

export function getDecision(sql: SqlStorage, phase: number): Decision | null {
  const row = sql
    .exec(
      `SELECT phase, note_id, decided_by
       FROM decisions
       WHERE phase = ?1`,
      phase,
    )
    .toArray()[0] as DecisionRow | undefined;

  if (!row) return null;
  return {
    phase: row.phase,
    noteId: row.note_id,
    decidedBy: row.decided_by,
  };
}

// 現在フェーズより前のフェーズで確定した決定を、決定時点の内容つきで返す。
export function getCarryovers(
  sql: SqlStorage,
  currentPhase: number,
): Carryover[] {
  const rows = sql
    .exec(
      `SELECT phase, note_id, note_content
       FROM decisions
       WHERE phase < ?1
       ORDER BY phase`,
      currentPhase,
    )
    .toArray() as CarryoverRow[];

  return rows.map((row) => ({
    phase: row.phase,
    noteId: row.note_id,
    content: row.note_content,
  }));
}

export function setDecision(
  sql: SqlStorage,
  phase: number,
  noteId: string,
  decidedBy: string,
  noteContent: string,
): void {
  sql.exec(
    `INSERT OR REPLACE INTO decisions
       (phase, note_id, decided_by, decided_at, note_content)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
    phase,
    noteId,
    decidedBy,
    new Date().toISOString(),
    noteContent,
  );
}
