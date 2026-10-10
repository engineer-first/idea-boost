import { describe, expect, it } from "vitest";
import {
  LEGACY_ROOM_DO_MIGRATION_IDS,
  migrateRoomStorage,
  ROOM_DO_MIGRATIONS,
} from "../room-do-migrations/index";
import { dropAllTables } from "../room-do-migrations/test-helpers";
import { runInRoomDO } from "../test-helpers";
import { getCarryovers, setDecision } from "./decisions";

const NOTE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "11111111-1111-4111-8111-111111111111";

function seed(sql: SqlStorage): void {
  sql.exec(
    "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, '変更後の本文', 'shared', 'pink', 0, 0, 1, 'now', 'now')",
    NOTE,
    USER,
  );
  sql.exec(
    "INSERT INTO note_appearances (note_id, font_size) VALUES (?1, 20)",
    NOTE,
  );
  for (const kind of ["subjective", "objective", "objective"]) {
    sql.exec(
      "INSERT INTO note_vote_stickers (id, note_id, user_id, kind, x, y, created_at) VALUES (?1, ?2, ?3, ?4, 0.5, 0.5, 'now')",
      crypto.randomUUID(),
      NOTE,
      USER,
      kind,
    );
  }
}

describe("決定付箋の参照データ", () => {
  it("既存ルームの外観と票を復元し、採用本文と欠損時の null を保持する", async () => {
    await runInRoomDO("decision-legacy-backfill", (_room, state) => {
      dropAllTables(state.storage);
      const prior = ROOM_DO_MIGRATIONS.filter(
        (migration) => migration.id < "20261010065250",
      );
      migrateRoomStorage(state.storage, prior, LEGACY_ROOM_DO_MIGRATION_IDS);
      const sql = state.storage.sql;
      seed(sql);
      sql.exec(
        "INSERT INTO decisions (phase, note_id, decided_by, decided_at, note_content) VALUES (1, ?1, ?2, 'now', '既存の採用本文'), (2, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', ?2, 'now', '欠損元付箋の本文')",
        NOTE,
        USER,
      );
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      expect(getCarryovers(sql, 3)).toEqual([
        {
          phase: 1,
          noteId: NOTE,
          content: "既存の採用本文",
          color: "pink",
          fontSize: 20,
          dotVotes: { subjective: 1, objective: 2 },
        },
        {
          phase: 2,
          noteId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          content: "欠損元付箋の本文",
          color: null,
          fontSize: null,
          dotVotes: null,
        },
      ]);
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      expect(getCarryovers(sql, 2)[0].content).toBe("既存の採用本文");
    });
  });
  it("採用時点の表示と集計のみを保持し、元データ変更や削除で失わない", async () => {
    await runInRoomDO("decision-appearance-snapshot", (_room, state) => {
      const sql = state.storage.sql;
      seed(sql);
      setDecision(sql, 1, NOTE, USER, "採用時点の本文");
      sql.exec("UPDATE notes SET color = 'blue' WHERE id = ?1", NOTE);
      sql.exec("DELETE FROM note_vote_stickers WHERE note_id = ?1", NOTE);
      const expected = [
        {
          phase: 1,
          noteId: NOTE,
          content: "採用時点の本文",
          color: "pink",
          fontSize: 20,
          dotVotes: { subjective: 1, objective: 2 },
        },
      ];
      expect(getCarryovers(sql, 2)).toEqual(expected);
      sql.exec("DELETE FROM notes WHERE id = ?1", NOTE);
      expect(getCarryovers(sql, 3)).toEqual(expected);
      expect(getCarryovers(sql, 1)).toEqual([]);
    });
  });
  it("元データ欠損時には本文を保ち、外観と票数を推測しない", async () => {
    await runInRoomDO("decision-missing-source", (_room, state) => {
      setDecision(state.storage.sql, 1, NOTE, USER, "残っている採用本文");
      expect(getCarryovers(state.storage.sql, 2)).toEqual([
        {
          phase: 1,
          noteId: NOTE,
          content: "残っている採用本文",
          color: null,
          fontSize: null,
          dotVotes: null,
        },
      ]);
    });
  });
});
