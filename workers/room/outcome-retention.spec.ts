import { describe, expect, it } from "vitest";
import {
  LEGACY_ROOM_DO_MIGRATION_IDS,
  migrateRoomStorage,
  ROOM_DO_MIGRATIONS,
} from "../room-do-migrations/index";
import { dropAllTables } from "../room-do-migrations/test-helpers";
import { runInRoomDO } from "../test-helpers";

const DAY_MS = 86400000;
// 保存期間を180日へ延ばす直前（2026-11-11）までの migration を適用済みの DO を再現する。
const BEFORE_RETENTION_EXTENSION = "20261111000000";

function migrateUntilBeforeExtension(storage: DurableObjectStorage): void {
  dropAllTables(storage);
  migrateRoomStorage(
    storage,
    ROOM_DO_MIGRATIONS.filter(
      (migration) => migration.id < BEFORE_RETENTION_EXTENSION,
    ),
    LEGACY_ROOM_DO_MIGRATION_IDS,
  );
}

function migrateAll(storage: DurableObjectStorage): void {
  migrateRoomStorage(storage, ROOM_DO_MIGRATIONS, LEGACY_ROOM_DO_MIGRATION_IDS);
}

function seedOutcome(
  sql: SqlStorage,
  roomId: string,
  expiresAt: number,
  savedJson: string | null,
): void {
  sql.exec(
    "INSERT INTO shared_outcome_identity(id,room_id,display_id) VALUES(1,?,'ABC123')",
    roomId,
  );
  sql.exec(
    "INSERT INTO shared_outcome_state(id,last_used_at,expires_at,phase_json,saved_json,save_status) VALUES(1,?,?,'{}',?,'saved')",
    expiresAt - 30 * DAY_MS,
    expiresAt,
    savedJson,
  );
}

function outcomeExpiresAt(sql: SqlStorage): number {
  return Number(
    sql.exec("SELECT expires_at FROM shared_outcome_state WHERE id=1").one()
      .expires_at,
  );
}

describe("30日期限で保存済みの成果を180日期限へ延ばす移行", () => {
  it.each([
    ["期限前", 10 * DAY_MS],
    ["期限ちょうどでアラームが起動した時点", 0],
  ])("本文が残る成果（%s）は期限を150日延ばす", async (label, offset) => {
    await runInRoomDO(`retention-outcome-${label}`, (_room, state) => {
      migrateUntilBeforeExtension(state.storage);
      const expiresAt = Date.now() + offset;
      seedOutcome(state.storage.sql, crypto.randomUUID(), expiresAt, '{"a":1}');
      migrateAll(state.storage);
      expect(outcomeExpiresAt(state.storage.sql)).toBe(
        expiresAt + 150 * DAY_MS,
      );
    });
  });

  it("期限で本文を削除済みの成果は期限を延ばさない", async () => {
    await runInRoomDO("retention-outcome-deleted", (_room, state) => {
      migrateUntilBeforeExtension(state.storage);
      const expiresAt = Date.now() - DAY_MS;
      seedOutcome(state.storage.sql, crypto.randomUUID(), expiresAt, null);
      migrateAll(state.storage);
      expect(outcomeExpiresAt(state.storage.sql)).toBe(expiresAt);
    });
  });

  it.each([
    ["未削除", 0, "150日延ばす", 150 * DAY_MS],
    ["期限で削除済み", 1, "延ばさない", 0],
  ])("%sの完了ルームは期限を%s", async (label, deleted, _result, extension) => {
    await runInRoomDO(`retention-completed-${label}`, (_room, state) => {
      migrateUntilBeforeExtension(state.storage);
      const expiresAt = Date.now();
      state.storage.sql.exec(
        "INSERT INTO completed_room(id,room_id,completed_at,expires_at,deleted) VALUES(1,?,?,?,?)",
        crypto.randomUUID(),
        expiresAt - 30 * DAY_MS,
        expiresAt,
        deleted,
      );
      migrateAll(state.storage);
      expect(
        state.storage.sql
          .exec("SELECT expires_at FROM completed_room WHERE id=1")
          .one().expires_at,
      ).toBe(expiresAt + extension);
    });
  });
});
