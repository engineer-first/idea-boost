// グルーピング（groups）の真実と、付箋の位置変化に追随する自動再編成。
// グループは shared な付箋だけから構成される（hasOnlySharedNotes で強制）。
import {
  type PersistentGroup,
  reorganizeGroups,
} from "../../contracts/grouping";
import type { RoomPhase } from "../../contracts/phase";
import type { ProtocolGroup } from "../../contracts/room-protocol";
import type { RoomBroadcaster } from "./broadcast";
import {
  type HandlerCtx,
  type MessageHandlers,
  replyForbidden,
} from "./handler-context";
import {
  findNote,
  hasOnlySharedNotes,
  isVisibleTo,
  listSharedNotes,
  NULL_VIEWER_ID,
  toProtocolNote,
} from "./notes";

export function listGroups(sql: SqlStorage): ProtocolGroup[] {
  const rows = sql
    .exec("SELECT id, name, note_ids, created_at, updated_at FROM groups")
    .toArray();
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    noteIds: JSON.parse(row.note_ids as string) as string[],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export function getGroupRevision(sql: SqlStorage): number {
  return Number(
    sql.exec("SELECT group_revision FROM room_state WHERE id=1").one()
      .group_revision,
  );
}

// 構成する付箋がすべて viewer に可視なグループだけを返す。snapshot 構築に使う。
export function listVisibleGroups(
  sql: SqlStorage,
  viewerId: string,
): ProtocolGroup[] {
  return listGroups(sql).filter((group) =>
    group.noteIds.every((noteId) => {
      const row = findNote(sql, noteId);
      return row !== null && isVisibleTo(row, viewerId);
    }),
  );
}

// snapshot/batch/旧groupイベントは同じ工程と全メンバー可視性を通す。
export function canViewBoardGroup(
  sql: SqlStorage,
  viewerId: string,
  group: ProtocolGroup,
  phase: RoomPhase,
): boolean {
  return (
    phase.kind === "step" &&
    phase.phase !== 2 &&
    group.noteIds.every((id) => {
      const row = findNote(sql, id);
      return (
        row !== null && row.phase === phase.phase && isVisibleTo(row, viewerId)
      );
    })
  );
}
export function listBoardGroups(
  sql: SqlStorage,
  viewerId: string,
  phase: RoomPhase,
): ProtocolGroup[] {
  return listVisibleGroups(sql, viewerId).filter((group) =>
    canViewBoardGroup(sql, viewerId, group, phase),
  );
}
// 可視性変更/削除で旧分類の名前と所属を再公開しない。分類全体を除去する。
// 呼出しはnoteの権限検査後、旧noteがまだ可視な時点で行う。
export function removeNoteGroups(
  ctx: HandlerCtx,
  noteId: string,
  phase: RoomPhase,
): void {
  const groups = listGroups(ctx.sql).filter((group) =>
    group.noteIds.includes(noteId),
  );
  for (const group of groups) {
    ctx.sql.exec("DELETE FROM groups WHERE id=?1", group.id);
    ctx.broadcaster.broadcastGroup(
      {
        type: "group:deleted",
        groupId: group.id,
        groupRevision: getGroupRevision(ctx.sql),
      },
      (viewerId) => canViewBoardGroup(ctx.sql, viewerId, group, phase),
    );
  }
}

export function saveGroups(
  storage: DurableObjectStorage,
  groups: PersistentGroup[],
): void {
  const current = listGroups(storage.sql);
  if (
    JSON.stringify(
      current.map((g) => ({ id: g.id, name: g.name, noteIds: g.noteIds })),
    ) ===
    JSON.stringify(
      groups.map((g) => ({ id: g.id, name: g.name, noteIds: g.noteIds })),
    )
  )
    return;
  storage.transactionSync(() => {
    // 削除前に元のグループの作成日時をメモリ上に退避する
    const existingRows = storage.sql
      .exec("SELECT id, created_at FROM groups")
      .toArray();
    const createdAtById = new Map<string, string>(
      existingRows.map((row) => [row.id as string, row.created_at as string]),
    );

    storage.sql.exec("DELETE FROM groups");
    const now = new Date().toISOString();
    for (const g of groups) {
      const createdAt = createdAtById.get(g.id) ?? now;

      storage.sql.exec(
        `INSERT INTO groups (id, name, note_ids, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
        g.id,
        g.name,
        JSON.stringify(g.noteIds),
        createdAt,
        now,
      );
    }
  });
}

// shared 付箋の現在位置からグループを再計算し、差分だけを配信する。
export function autoReorganize(
  storage: DurableObjectStorage,
  broadcaster: RoomBroadcaster,
): void {
  const sql = storage.sql;
  const notes = listSharedNotes(sql);
  const currentGroups = listGroups(sql);
  const nextGroups = reorganizeGroups(notes, currentGroups);

  const nextIds = new Set(nextGroups.map((g) => g.id));

  saveGroups(storage, nextGroups);

  // 1. 削除されたグループをブロードキャスト
  for (const prevGroup of currentGroups) {
    if (!nextIds.has(prevGroup.id)) {
      broadcaster.broadcastToAll({
        type: "group:deleted",
        groupRevision: getGroupRevision(sql),
        groupId: prevGroup.id,
      });
    }
  }

  // 2. 更新・作成されたグループをブロードキャスト
  for (const g of nextGroups) {
    const prev = currentGroups.find((p) => p.id === g.id);
    if (!prev || JSON.stringify(prev.noteIds) !== JSON.stringify(g.noteIds)) {
      const noteRow = findNote(sql, g.noteIds[0]);
      if (noteRow) {
        const group: ProtocolGroup = {
          id: g.id,
          name: g.name,
          noteIds: g.noteIds,
          createdAt: prev?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        broadcaster.broadcast(
          {
            type: "group:updated",
            group,
            groupRevision: getGroupRevision(sql),
          },
          toProtocolNote(sql, noteRow, NULL_VIEWER_ID),
        );
      }
    }
  }
}

export const groupHandlers: MessageHandlers<
  "group:create" | "group:update-name"
> = {
  "group:create": (ctx, message) => {
    const g = message.group;
    if (!hasOnlySharedNotes(ctx.sql, g.noteIds)) {
      replyForbidden(ctx);
      return;
    }
    const now = new Date().toISOString();
    ctx.sql.exec(
      `INSERT INTO groups (id, name, note_ids, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET name = ?2, note_ids = ?3, updated_at = ?5`,
      g.id,
      g.name,
      JSON.stringify(g.noteIds),
      g.createdAt || now,
      now,
    );

    const noteRow = findNote(ctx.sql, g.noteIds[0]);
    if (noteRow) {
      ctx.broadcaster.broadcast(
        {
          type: "group:updated",
          group: g,
          groupRevision: getGroupRevision(ctx.sql),
        },
        toProtocolNote(ctx.sql, noteRow, ctx.userId),
      );
    }
  },

  "group:update-name": (ctx, message) => {
    const rows = ctx.sql
      .exec(
        "SELECT id, name, note_ids, created_at FROM groups WHERE id = ?1",
        message.groupId,
      )
      .toArray();
    if (rows.length === 0) {
      ctx.reply({
        type: "error",
        code: "not-found",
        message: "指定されたグループが見つかりません。",
      });
      return;
    }

    const row = rows[0];
    const noteIds = JSON.parse(row.note_ids as string) as string[];
    if (!hasOnlySharedNotes(ctx.sql, noteIds)) {
      replyForbidden(ctx);
      return;
    }
    const now = new Date().toISOString();
    ctx.sql.exec(
      "UPDATE groups SET name = ?2, updated_at = ?3 WHERE id = ?1",
      message.groupId,
      message.name,
      now,
    );

    const group: ProtocolGroup = {
      id: message.groupId,
      name: message.name,
      noteIds,
      createdAt: row.created_at as string,
      updatedAt: now,
    };

    const noteRow = findNote(ctx.sql, noteIds[0]);
    if (noteRow) {
      ctx.broadcaster.broadcast(
        {
          type: "group:updated",
          group,
          groupRevision: getGroupRevision(ctx.sql),
        },
        toProtocolNote(ctx.sql, noteRow, ctx.userId),
      );
    }
  },
};
