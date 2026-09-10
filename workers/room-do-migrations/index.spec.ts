// RoomDO 内蔵 SQLite のマイグレーション集約（ROOM_DO_MIGRATIONS）の統合
// テスト。実際のマイグレーション定義一式を使い、DO 起動時に最新スキーマ
// まで収束できることを検証する。個々の migrateRoomStorage の振る舞い
// （未適用IDのみ適用・原子性・fail-closed）は ./apply.spec.ts を参照。
import { describe, expect, it } from "vitest";
import { runInRoomDO } from "../test-helpers";
import {
  LEGACY_ROOM_DO_MIGRATION_IDS,
  migrateRoomStorage,
  ROOM_DO_MIGRATIONS,
} from "./index";
import { appliedMigrationIds, dropAllTables, tableNames } from "./test-helpers";

const USER_A = "11111111-1111-4111-8111-111111111111";

const NORMALIZE_PHASE_MIGRATION_ID = "20260715042808";
const VOTE_STICKERS_MIGRATION_ID = "20260909044704";

const ALL_MIGRATION_IDS = ROOM_DO_MIGRATIONS.map((m) => m.id);

const ALL_TABLES = [
  "decisions",
  "groups",
  "member_color_assignments",
  "members",
  "note_vote_stickers",
  "note_votes",
  "notes",
  "room_owner",
  "room_state",
  "schema_migrations",
  "timer_state",
];

describe("ROOM_DO_MIGRATIONS", () => {
  it("timer_state は id=1 以外と状態に不整合な列を拒否する", async () => {
    await runInRoomDO("mig-timer-constraints", (_instance, state) => {
      expect(() =>
        state.storage.sql.exec(
          "INSERT INTO timer_state (id, status) VALUES (2, 'idle')",
        ),
      ).toThrow();
      expect(() =>
        state.storage.sql.exec(
          "UPDATE timer_state SET status = 'running' WHERE id = 1",
        ),
      ).toThrow();
    });
  });

  it("timer_state は id=1 の idle 状態で初期化される", async () => {
    await runInRoomDO("mig-timer-seed", (_instance, state) => {
      expect(
        state.storage.sql
          .exec(
            "SELECT id, status, ends_at, remaining_ms, duration_ms FROM timer_state",
          )
          .toArray(),
      ).toEqual([
        {
          id: 1,
          status: "idle",
          ends_at: null,
          remaining_ms: null,
          duration_ms: null,
        },
      ]);
    });
  });

  it("空のストレージに全マイグレーションを適用し、適用済みIDを記録する", async () => {
    await runInRoomDO("mig-fresh", (_instance, state) => {
      dropAllTables(state.storage);
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      expect(tableNames(state.storage)).toEqual(ALL_TABLES);
      expect(appliedMigrationIds(state.storage)).toEqual(ALL_MIGRATION_IDS);
    });
  });

  it("再実行しても失敗せず、適用記録も変わらない（冪等）", async () => {
    await runInRoomDO("mig-idempotent", (_instance, state) => {
      dropAllTables(state.storage);
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      expect(appliedMigrationIds(state.storage)).toEqual(ALL_MIGRATION_IDS);
    });
  });

  it("集約済みの旧票を個別シールへ展開し、二重集計を残さない", async () => {
    await runInRoomDO("mig-vote-stickers", (_instance, state) => {
      dropAllTables(state.storage);
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS.filter(({ id }) => id < VOTE_STICKERS_MIGRATION_ID),
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      state.storage.sql.exec(
        `INSERT INTO note_votes (note_id, user_id, kind, created_at, vote_count)
         VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ?1, 'objective', ?2, 3)`,
        USER_A,
        "2026-09-09T00:00:00.000Z",
      );
      state.storage.sql.exec(
        `INSERT INTO note_votes (note_id, user_id, kind, created_at, vote_count)
         VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ?1, 'subjective', ?2, 0)`,
        USER_A,
        "2026-09-09T00:00:00.000Z",
      );

      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );

      const stickers = state.storage.sql
        .exec(
          "SELECT kind, x, y FROM note_vote_stickers WHERE note_id = ?1 ORDER BY x",
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        )
        .toArray();
      expect(stickers).toHaveLength(3);
      expect(stickers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "objective", y: 0.16 }),
        ]),
      );
      expect(
        state.storage.sql
          .exec(
            "SELECT id FROM note_vote_stickers WHERE note_id = ?1",
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          )
          .toArray(),
      ).toEqual([]);
      expect(
        state.storage.sql.exec("SELECT COUNT(*) AS count FROM note_votes").one()
          .count,
      ).toBe(0);
    });
  });

  it("版管理導入以前のストレージ（テーブルあり・版記録なし）をデータを保ったまま吸収する", async () => {
    await runInRoomDO("mig-legacy", (_instance, state) => {
      dropAllTables(state.storage);
      // 版管理導入前の constructor が作っていたスキーマを再現する。
      state.storage.sql.exec(
        `CREATE TABLE members (
           user_id TEXT PRIMARY KEY,
           joined_at TEXT NOT NULL DEFAULT (datetime('now'))
         );
         CREATE TABLE notes (
           id TEXT PRIMARY KEY,
           author_id TEXT NOT NULL,
           content TEXT NOT NULL DEFAULT '',
           x REAL NOT NULL,
           y REAL NOT NULL,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL
         );
         CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
      );
      state.storage.sql.exec(
        "INSERT INTO members (user_id) VALUES (?1)",
        USER_A,
      );

      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );

      expect(appliedMigrationIds(state.storage)).toEqual(ALL_MIGRATION_IDS);
      // 既存データは破壊されない。
      const members = state.storage.sql
        .exec("SELECT user_id FROM members")
        .toArray();
      expect(members).toEqual([{ user_id: USER_A }]);
      // 旧 meta テーブル（招待コードの複製）は掃除される。
      expect(tableNames(state.storage)).not.toContain("meta");
      expect(tableNames(state.storage)).toContain("note_votes");
    });
  });

  it("v1 → 最新: members.name と room_state / room_owner が追加され、既存行は保持される", async () => {
    await runInRoomDO("mig-v2-alter", (_instance, state) => {
      dropAllTables(state.storage);
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS.slice(0, 1),
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );

      // v1 時点でメンバーを追加（name カラムがまだ無い）
      state.storage.sql.exec(
        "INSERT INTO members (user_id) VALUES (?1)",
        USER_A,
      );
      expect(
        state.storage.sql.exec("SELECT user_id FROM members").toArray(),
      ).toEqual([{ user_id: USER_A }]);

      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );

      // v4/v6 適用後もメンバー行が残り、name は空文字、color は yellow
      const rows = state.storage.sql
        .exec("SELECT user_id, name, color FROM members")
        .toArray();
      expect(rows).toEqual([{ user_id: USER_A, name: "", color: "yellow" }]);
      expect(
        state.storage.sql
          .exec("SELECT user_id, color FROM member_color_assignments")
          .toArray(),
      ).toEqual([{ user_id: USER_A, color: "yellow" }]);

      // room_state の旧既定 phase1 は正規化 migration で phase1-step1 になる
      // （新規ルームは initializeNewRoom で lobby へ）
      const stateRows = state.storage.sql
        .exec("SELECT phase FROM room_state")
        .toArray();
      expect(stateRows).toEqual([{ phase: "phase1-step1" }]);

      expect(tableNames(state.storage)).toContain("room_owner");
      expect(tableNames(state.storage)).toContain("note_votes");
    });
  });

  // 旧4フェーズ制（書く/共有/投票/集計）は現在のフェーズ1の5ステップ制へ
  // 再編された（グループ化 = step 3 が新設）。旧値を decode 時に読み替える
  // のではなく、保存形式そのものをここで一度に正規化する。
  it.each([
    ["writing", "phase1-step1"],
    ["phase1", "phase1-step1"],
    ["phase2", "phase1-step2"],
    ["phase3", "phase1-step4"],
    ["phase4", "phase1-step5"],
    ["lobby", "lobby"],
    ["phase2-step3", "phase2-step3"],
  ])("旧フラット形式の phase=%s を %s へ正規化する", async (raw, expected) => {
    await runInRoomDO(`mig-phase-normalize-${raw}`, (_instance, state) => {
      dropAllTables(state.storage);
      const normalizeIndex = ROOM_DO_MIGRATIONS.findIndex(
        (m) => m.id === NORMALIZE_PHASE_MIGRATION_ID,
      );
      expect(normalizeIndex).toBeGreaterThanOrEqual(0);
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS.slice(0, normalizeIndex),
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      state.storage.sql.exec(
        "UPDATE room_state SET phase = ?1 WHERE id = 1",
        raw,
      );

      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );

      expect(
        state.storage.sql.exec("SELECT phase FROM room_state").toArray(),
      ).toEqual([{ phase: expected }]);
    });
  });

  it("v4 → 最新: 既存の付箋は shared として可視性を持つ", async () => {
    await runInRoomDO("mig-note-visibility", (_instance, state) => {
      dropAllTables(state.storage);
      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS.slice(0, 4),
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      state.storage.sql.exec(
        `INSERT INTO notes (id, author_id, content, x, y, created_at, updated_at)
         VALUES ('note-1', ?1, '既存付箋', 0, 0, '2026-07-10T00:00:00.000Z', '2026-07-10T00:00:00.000Z')`,
        USER_A,
      );

      migrateRoomStorage(
        state.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );

      expect(
        state.storage.sql.exec("SELECT visibility FROM notes").toArray(),
      ).toEqual([{ visibility: "shared" }]);
    });
  });
});

describe("RoomDO constructor の配線", () => {
  it("新規 DO は起動時に最新版までマイグレーションされている", async () => {
    await runInRoomDO("mig-wired", (_instance, state) => {
      expect(appliedMigrationIds(state.storage)).toEqual(ALL_MIGRATION_IDS);
      expect(tableNames(state.storage)).toEqual(ALL_TABLES);
    });
  });
});
