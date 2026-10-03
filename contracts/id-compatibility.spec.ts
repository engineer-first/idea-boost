import { describe, expect, it } from "vitest";
import { JoinRoomResponseSchema } from "./api";
import {
  NoteSchema,
  parseClientMessage,
  parseServerMessage,
} from "./room-protocol";
import { SessionPayloadSchema } from "./session";

// Zod 3 が受理していた ID を、依存更新だけで拒否しない。
// URL 判定の UUID_PATTERN と同じ 8-4-4-4-12 の受理範囲を保つ。
describe("ID の境界互換性", () => {
  it.each([
    "11111111-1111-4111-8111-111111111111",
    "11111111-1111-1111-1111-111111111111",
    "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
    "00000000-0000-0000-0000-000000000000",
  ])("保存済みの ID %s をセッション・REST・WSで受け入れる", (id) => {
    expect(
      SessionPayloadSchema.parse({ sub: id, email: "owner@example.test" }),
    ).toEqual({ sub: id, email: "owner@example.test" });
    expect(JoinRoomResponseSchema.parse({ roomId: id })).toEqual({
      roomId: id,
    });
    expect(
      parseClientMessage(JSON.stringify({ type: "note:delete", noteId: id })),
    ).toEqual({
      type: "note:delete",
      noteId: id,
    });
    expect(
      parseServerMessage(JSON.stringify({ type: "note:deleted", noteId: id })),
    ).toEqual({
      type: "note:deleted",
      noteId: id,
    });
  });

  it.each(["not-a-uuid", "11111111-1111-1111-1111-11111111111g", ""])(
    "形式が不正な ID %s は各境界で拒否する",
    (id) => {
      expect(
        SessionPayloadSchema.safeParse({ sub: id, email: "owner@example.test" })
          .success,
      ).toBe(false);
      expect(JoinRoomResponseSchema.safeParse({ roomId: id }).success).toBe(
        false,
      );
      expect(
        parseClientMessage(JSON.stringify({ type: "note:delete", noteId: id })),
      ).toBeNull();
      expect(
        parseServerMessage(
          JSON.stringify({ type: "note:deleted", noteId: id }),
        ),
      ).toBeNull();
    },
  );
});

describe("最新ルーム操作の ID 互換性", () => {
  const legacyId = "11111111-1111-1111-1111-111111111111";
  const otherId = "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF";

  it.each([legacyId, otherId])(
    "除外の復元・決定取消に旧形式 %s を使える",
    (id) => {
      expect(
        parseClientMessage(
          JSON.stringify({
            type: "note:restore",
            noteId: id,
            expectedExclusionOperationId: id,
          }),
        ),
      ).toEqual({
        type: "note:restore",
        noteId: id,
        expectedExclusionOperationId: id,
      });
      expect(
        parseClientMessage(
          JSON.stringify({ type: "decision:clear", noteId: id }),
        ),
      ).toEqual({ type: "decision:clear", noteId: id });
      expect(NoteSchema.shape.exclusionOperationId.safeParse(id).success).toBe(
        true,
      );
    },
  );

  it.each(["not-a-uuid", "11111111-1111-1111-1111-11111111111g", ""])(
    "追加された境界でも不正なID %s は拒否する",
    (id) => {
      expect(NoteSchema.shape.exclusionOperationId.safeParse(id).success).toBe(
        false,
      );
      expect(
        parseClientMessage(
          JSON.stringify({
            type: "note:restore",
            noteId: legacyId,
            expectedExclusionOperationId: id,
          }),
        ),
      ).toBeNull();
      expect(
        parseClientMessage(
          JSON.stringify({ type: "decision:clear", noteId: id }),
        ),
      ).toBeNull();
    },
  );
});
