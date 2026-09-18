import { describe, expect, it } from "vitest";
import { runInRoomDO } from "../test-helpers";
import {
  clearUsedNoteDragIds,
  hasReachedNoteDragStartRateLimit,
  hasUsedNoteDragId,
  MAX_USED_NOTE_DRAG_IDS_PER_USER,
  NOTE_DRAG_START_RATE_LIMIT_PER_MINUTE,
  recordUsedNoteDragId,
} from "./drag-operations";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("used note drag IDs", () => {
  it("ユーザーごとの保持数を上限内に収め、直近の ID を再送拒否に使う", async () => {
    await runInRoomDO("used-note-drag-ids-cap", (_instance, state) => {
      for (let index = 0; index <= MAX_USED_NOTE_DRAG_IDS_PER_USER; index++) {
        recordUsedNoteDragId(state.storage.sql, USER_A, `drag-${index}`);
      }

      const rows = state.storage.sql
        .exec(
          "SELECT drag_id FROM used_note_drag_ids WHERE user_id = ?1 ORDER BY rowid",
          USER_A,
        )
        .toArray() as { drag_id: string }[];
      expect(rows).toHaveLength(MAX_USED_NOTE_DRAG_IDS_PER_USER);
      expect(hasUsedNoteDragId(state.storage.sql, USER_A, "drag-0")).toBe(
        false,
      );
      expect(
        hasUsedNoteDragId(
          state.storage.sql,
          USER_A,
          `drag-${MAX_USED_NOTE_DRAG_IDS_PER_USER}`,
        ),
      ).toBe(true);
    });
  });

  it("1分間の受理数が上限に達したユーザーだけ新規開始を制限する", async () => {
    await runInRoomDO("used-note-drag-ids-rate", (_instance, state) => {
      for (
        let index = 0;
        index < NOTE_DRAG_START_RATE_LIMIT_PER_MINUTE;
        index++
      ) {
        recordUsedNoteDragId(state.storage.sql, USER_A, `recent-${index}`);
      }

      expect(hasReachedNoteDragStartRateLimit(state.storage.sql, USER_A)).toBe(
        true,
      );
      expect(hasReachedNoteDragStartRateLimit(state.storage.sql, USER_B)).toBe(
        false,
      );
    });
  });

  it("フェーズ境界では再送防止履歴を破棄する", async () => {
    await runInRoomDO("used-note-drag-ids-clear", (_instance, state) => {
      recordUsedNoteDragId(state.storage.sql, USER_A, "old-phase-drag");

      clearUsedNoteDragIds(state.storage.sql);

      expect(
        state.storage.sql.exec("SELECT 1 FROM used_note_drag_ids").toArray(),
      ).toEqual([]);
    });
  });
});
