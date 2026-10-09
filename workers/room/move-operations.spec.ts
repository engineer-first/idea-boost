import { describe, expect, it } from "vitest";
import { CANVAS_COORDINATE_LIMIT } from "../../contracts/board";
import type {
  ClientMessage,
  ServerMessage,
} from "../../contracts/room-protocol";
import {
  parseClientMessage,
  parseServerMessage,
} from "../../contracts/room-protocol";
import { runInRoomDO } from "../test-helpers";
import { RoomBroadcaster, type SocketAttachment } from "./broadcast";
import { groupHandlers, listGroups, saveGroups } from "./groups";
import type { HandlerCtx } from "./handler-context";
import {
  expireMoveOperations,
  moveHandlers,
  releaseConnectionMoves,
  syncMovePresence,
} from "./move-operations";
import { noteHandlers } from "./note-handlers";
import { findNote, insertNote, toProtocolNote } from "./notes";
import { savePhase } from "./phase";
import { presenceHandlers } from "./presence";
import type { RoomDO } from "./room-do";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const N1 = "33333333-3333-4333-8333-333333333333";
const N2 = "44444444-4444-4444-8444-444444444444";
const OP = "55555555-5555-4555-8555-555555555555";
const OP2 = "66666666-6666-4666-8666-666666666666";
async function setup(
  name: string,
  test: (
    ctx: HandlerCtx,
    responses: ServerMessage[],
    instance: RoomDO,
  ) => void | Promise<void>,
) {
  await runInRoomDO(name, async (instance, state) => {
    state.storage.sql.exec(
      "INSERT INTO members(user_id) VALUES (?1), (?2)",
      A,
      B,
    );
    savePhase(state.storage.sql, { kind: "step", phase: 1, step: 3 });
    for (const [id, x] of [
      [N1, 100],
      [N2, 140],
    ] as const)
      insertNote(state.storage.sql, {
        id,
        author_id: A,
        content: "test",
        visibility: "shared",
        color: "yellow",
        font_size: 14,
        x,
        y: 100,
        stack_order: x,
        phase: 1,
        excluded: false,
        created_at: "2026-10-04T00:00:00.000Z",
        updated_at: "2026-10-04T00:00:00.000Z",
      });
    let attachment: SocketAttachment = {
      userId: A,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 600,
    };
    const ws = {
      deserializeAttachment: () => attachment,
      serializeAttachment: (next: SocketAttachment) => {
        attachment = next;
      },
      readyState: 1,
      send: () => {},
    } as unknown as WebSocket;
    const responses: ServerMessage[] = [];
    const ctx: HandlerCtx = {
      sql: state.storage.sql,
      storage: state.storage,
      userId: A,
      ws,
      reply: (response) => responses.push(response),
      broadcaster: new RoomBroadcaster({ getWebSockets: () => [ws] }),
      refreshSnapshots: () => {},
    };
    await test(ctx, responses, instance);
  });
}
function start(ctx: HandlerCtx, operationId = OP, ids = [N1, N2]) {
  const row = ctx.sql
    .exec(
      "SELECT phase_revision, group_revision, map_revision FROM room_state WHERE id=1",
    )
    .one();
  moveHandlers["note:move:start"](ctx, {
    type: "note:move:start",
    operationId,
    expectedPhaseRevision: Number(row.phase_revision),
    expectedGroupRevision: Number(row.group_revision),
    expectedMapRevision: Number(row.map_revision),
    coordinateSpace: "canvas",
    targets: ids.map((noteId) => ({
      noteId,
      positionRevision: 0,
      visibilityRevision: 0,
    })),
  } as ClientMessage & { type: "note:move:start" });
}
function commit(ctx: HandlerCtx, operationId = OP) {
  moveHandlers["note:move:commit"](ctx, {
    type: "note:move:commit",
    operationId,
    delta: { x: 300, y: 0 },
  } as ClientMessage & { type: "note:move:commit" });
}
function peer(ctx: HandlerCtx, userId = B) {
  const messages: Record<string, unknown>[] = [];
  const socket = {
    deserializeAttachment: () => ({
      userId,
      sessionExpiresAt: Math.floor(Date.now() / 1000) + 600,
    }),
    readyState: 1,
    send: (payload: string) => messages.push(JSON.parse(payload)),
  } as unknown as WebSocket;
  ctx.broadcaster = new RoomBroadcaster({
    getWebSockets: () => [ctx.ws, socket],
  });
  return messages;
}
describe("move transaction", () => {
  it("非memberの旧接続へ不可視分類の版通知を配信しない", () =>
    setup("move-group-revision-nonmember", (ctx) => {
      const messages = peer(ctx, OP2);
      savePhase(ctx.sql, { kind: "step", phase: 1, step: 2 });
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N2);
      ctx.sql.exec(
        "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'secret',?2,'now','now')",
        OP,
        JSON.stringify([N1, N2]),
      );
      noteHandlers["note:unpublish"](ctx, {
        type: "note:unpublish",
        noteId: N1,
      });
      expect(messages.some((m) => m.type === "group:revision")).toBe(false);
      expect(JSON.stringify(messages)).not.toContain("secret");
      expect(JSON.stringify(messages)).not.toContain(N2);
    }));
  it("途中位置を全件peerへ配信し取消終了、確定位置は変更しない", () =>
    setup("move-peer-preview", (ctx) => {
      const messages = peer(ctx);
      start(ctx);
      moveHandlers["note:move:preview"](ctx, {
        type: "note:move:preview",
        operationId: OP,
        delta: { x: 20, y: 30 },
      });
      expect(
        messages.find((m) => m.type === "notes:move-preview"),
      ).toMatchObject({
        operationId: OP,
        positions: [
          { noteId: N1, x: 120, y: 130 },
          { noteId: N2, x: 160, y: 130 },
        ],
      });
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
      moveHandlers["note:move:cancel"](ctx, {
        type: "note:move:cancel",
        operationId: OP,
      });
      expect(messages.find((m) => m.type === "notes:move-ended")).toMatchObject(
        { operationId: OP },
      );
    }));
  it("開始後privateになった一件を含むpreviewを一切配信しない", () =>
    setup("move-peer-private", (ctx) => {
      const messages = peer(ctx);
      start(ctx);
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N2);
      moveHandlers["note:move:preview"](ctx, {
        type: "note:move:preview",
        operationId: OP,
        delta: { x: 20, y: 0 },
      });
      expect(messages.filter((m) => m.type === "notes:move-preview")).toEqual(
        [],
      );
      expect(JSON.stringify(messages)).not.toContain(N2);
    }));
  it.each([
    "lease",
    "connection",
    "phase",
    "member",
    "lock",
    "position",
    "visibility",
    "group",
    "map",
    "adoption",
  ])("peer previewを%s失効で全件解除する", (reason) =>
    setup(`move-peer-retire-${reason}`, (ctx) => {
      const messages = peer(ctx);
      start(ctx);
      moveHandlers["note:move:preview"](ctx, {
        type: "note:move:preview",
        operationId: OP,
        delta: { x: 20, y: 0 },
      });
      expect(
        messages.filter((m) => m.type === "notes:move-preview"),
      ).toHaveLength(1);
      if (reason === "lease") expireMoveOperations(ctx.sql, Date.now() + 20000);
      if (reason === "connection")
        releaseConnectionMoves(
          ctx.sql,
          (ctx.ws.deserializeAttachment() as SocketAttachment)
            .moveConnectionId ?? "",
        );
      if (reason === "phase")
        savePhase(ctx.sql, { kind: "step", phase: 1, step: 4 });
      if (reason === "member")
        ctx.sql.exec("DELETE FROM members WHERE user_id=?1", A);
      if (reason === "lock")
        ctx.sql.exec("DELETE FROM note_move_locks WHERE note_id=?1", N2);
      if (reason === "position")
        ctx.sql.exec("UPDATE notes SET x=x+1 WHERE id=?1", N2);
      if (reason === "visibility")
        ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N2);
      if (reason === "group")
        ctx.sql.exec(
          "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'peer group',?2,'now','now')",
          OP2,
          JSON.stringify([N1, N2]),
        );
      if (reason === "map")
        ctx.sql.exec(
          "UPDATE room_state SET map_revision=map_revision+1 WHERE id=1",
        );
      if (reason === "adoption")
        ctx.sql.exec(
          "INSERT INTO decisions(phase,note_id,decided_by,decided_at) VALUES(1,?1,?2,?3)",
          N1,
          A,
          new Date().toISOString(),
        );
      syncMovePresence(ctx.sql, ctx.broadcaster);
      expect(messages.filter((m) => m.type === "notes:move-ended")).toEqual([
        { type: "notes:move-ended", operationId: OP },
      ]);
      moveHandlers["note:move:preview"](ctx, {
        type: "note:move:preview",
        operationId: OP,
        delta: { x: 40, y: 0 },
      });
      expect(
        messages.filter((m) => m.type === "notes:move-preview"),
      ).toHaveLength(1);
    }));
  it("確定batchが終了通知より先に届き途中本文・票・分類を送らない", () =>
    setup("move-peer-commit-order", (ctx) => {
      const messages = peer(ctx);
      start(ctx);
      moveHandlers["note:move:preview"](ctx, {
        type: "note:move:preview",
        operationId: OP,
        delta: { x: 20, y: 0 },
      });
      const preview = messages.find((m) => m.type === "notes:move-preview");
      expect(parseServerMessage(JSON.stringify(preview))).toEqual(preview);
      expect(JSON.stringify(preview)).not.toMatch(
        /content|dotVote|group|author|candidate/,
      );
      commit(ctx);
      expect(messages.findIndex((m) => m.type === "notes:moved")).toBeLessThan(
        messages.findIndex((m) => m.type === "notes:move-ended"),
      );
    }));
  it("非member受信者へpreviewを配信しない", () =>
    setup("move-peer-nonmember", (ctx) => {
      const messages = peer(ctx, OP2);
      start(ctx);
      moveHandlers["note:move:preview"](ctx, {
        type: "note:move:preview",
        operationId: OP,
        delta: { x: 20, y: 0 },
      });
      expect(messages.filter((m) => m.type === "notes:move-preview")).toEqual(
        [],
      );
      moveHandlers["note:move:cancel"](ctx, {
        type: "note:move:cancel",
        operationId: OP,
      });
      expect(messages.filter((m) => m.type === "notes:move-ended")).toEqual([]);
    }));
  it("別接続のpreviewを拒否し所有者の移動を取り消さない", () =>
    setup("move-peer-foreign-connection", (ctx, responses) => {
      const messages = peer(ctx);
      start(ctx);
      const ws = {
        deserializeAttachment: () => ({ userId: A, moveConnectionId: OP2 }),
      } as unknown as WebSocket;
      moveHandlers["note:move:preview"](
        { ...ctx, ws },
        { type: "note:move:preview", operationId: OP, delta: { x: 20, y: 0 } },
      );
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
      expect(messages.filter((m) => m.type === "notes:move-preview")).toEqual(
        [],
      );
      expect(
        ctx.sql
          .exec(
            "SELECT state FROM note_move_operations WHERE operation_id=?1",
            OP,
          )
          .one().state,
      ).toBe("active");
    }));
  it.each([
    "single",
    "map",
    "same-user",
  ])("%sでもdrag中全件を同期し版を保存しない", (mode) =>
    setup(`move-peer-${mode}`, (ctx) => {
      const messages = peer(ctx, mode === "same-user" ? A : B);
      if (mode === "map") {
        savePhase(ctx.sql, { kind: "step", phase: 3, step: 3 });
        ctx.sql.exec(
          "UPDATE notes SET phase=3,x=CASE WHEN id=?1 THEN 20 ELSE 60 END,y=30",
          N1,
        );
      }
      const revision = ctx.sql
        .exec(
          "SELECT phase_revision,group_revision,map_revision FROM room_state WHERE id=1",
        )
        .one();
      const ids = mode === "single" ? [N1] : [N1, N2];
      const before = ids.map((id) => findNote(ctx.sql, id));
      moveHandlers["note:move:start"](ctx, {
        type: "note:move:start",
        operationId: OP,
        expectedPhaseRevision: Number(revision.phase_revision),
        expectedGroupRevision: Number(revision.group_revision),
        expectedMapRevision: Number(revision.map_revision),
        coordinateSpace: mode === "map" ? "map" : "canvas",
        targets: before.map((note) => ({
          noteId: note?.id ?? N1,
          positionRevision: note?.position_revision ?? 0,
          visibilityRevision: note?.visibility_revision ?? 0,
        })),
      });
      moveHandlers["note:move:preview"](ctx, {
        type: "note:move:preview",
        operationId: OP,
        delta: { x: 50, y: 10 },
      });
      const preview = messages.find((m) => m.type === "notes:move-preview");
      expect(preview).toMatchObject({
        positions: before.map((note) => ({
          noteId: note?.id,
          x: (note?.x ?? 0) + (mode === "map" ? 40 : 50),
          y: (note?.y ?? 0) + 10,
        })),
      });
      expect(ids.map((id) => findNote(ctx.sql, id))).toEqual(before);
    }));
  it("start/preview/cancelで確定位置・group・版を変更しない", () =>
    setup("move-preview", (ctx, responses) => {
      start(ctx);
      moveHandlers["note:move:preview"](ctx, {
        type: "note:move:preview",
        operationId: OP,
        delta: { x: 300, y: 0 },
      } as ClientMessage & { type: "note:move:preview" });
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
      expect(findNote(ctx.sql, N2)?.x).toBe(140);
      moveHandlers["note:move:cancel"](ctx, {
        type: "note:move:cancel",
        operationId: OP,
      } as ClientMessage & { type: "note:move:cancel" });
      commit(ctx);
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
      expect(responses.at(-1)).toMatchObject({
        type: "note:move:result",
        status: "cancelled",
      });
    }));
  it("private/非authorの混合集合を全拒否し秘密の対象を返信しない", () =>
    setup("move-private", (ctx, responses) => {
      ctx.sql.exec(
        "UPDATE notes SET visibility='private',author_id=?1 WHERE id=?2",
        B,
        N2,
      );
      start(ctx);
      expect(responses.at(-1)).toMatchObject({
        type: "note:move:result",
        status: "rejected",
      });
      expect(JSON.stringify(responses)).not.toContain(N2);
      expect(
        ctx.sql.exec("SELECT * FROM note_move_locks").toArray(),
      ).toHaveLength(0);
    }));
  it("1件のlock競合で全件開始拒否", () =>
    setup("move-lock", (ctx, responses) => {
      start(ctx, OP, [N2]);
      start({ ...ctx, userId: B }, OP2);
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
      expect(
        ctx.sql.exec("SELECT note_id FROM note_move_locks").toArray(),
      ).toEqual([{ note_id: N2 }]);
    }));
  it("全位置を一度に確定し再送・結果照会で同一receiptを返す", () =>
    setup("move-commit", (ctx, responses) => {
      start(ctx);
      commit(ctx);
      expect(findNote(ctx.sql, N1)?.x).toBe(400);
      expect(findNote(ctx.sql, N2)?.x).toBe(440);
      const receipt = responses.at(-1);
      expect(parseServerMessage(JSON.stringify(receipt))).toEqual(receipt);
      commit(ctx);
      expect(responses.at(-1)).toEqual(receipt);
      moveHandlers["note:move:status"](ctx, {
        type: "note:move:status",
        operationId: OP,
      } as ClientMessage & { type: "note:move:status" });
      expect(responses.at(-1)).toEqual(receipt);
      expect(findNote(ctx.sql, N1)?.x).toBe(400);
    }));
  it("ABA位置競合で全拒否", () =>
    setup("move-aba", (ctx, responses) => {
      start(ctx);
      ctx.sql.exec("UPDATE notes SET x=200 WHERE id=?1", N2);
      ctx.sql.exec("UPDATE notes SET x=140 WHERE id=?1", N2);
      commit(ctx);
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
    }));
  it("group保存失敗でも位置とreceiptを残さない", () =>
    setup("move-rollback", (ctx, responses) => {
      ctx.sql.exec(
        "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'分類',?2,'now','now')",
        OP2,
        JSON.stringify([N1, N2]),
      );
      start(ctx, OP, [N1]);
      ctx.sql.exec(
        "CREATE TRIGGER reject_move_group BEFORE DELETE ON groups BEGIN SELECT RAISE(ABORT, 'injected'); END",
      );
      moveHandlers["note:move:commit"](ctx, {
        type: "note:move:commit",
        operationId: OP,
        delta: { x: 600, y: 0 },
      });
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
      expect(findNote(ctx.sql, N2)?.x).toBe(140);
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
    }));
  it("half-open期限後にlockを解放し旧commitを確定しない", () =>
    setup("move-lease", (ctx, responses) => {
      start(ctx);
      ctx.sql.exec(
        "UPDATE note_move_operations SET lease_until=0 WHERE operation_id=?1",
        OP,
      );
      expireMoveOperations(ctx.sql);
      expect(
        ctx.sql.exec("SELECT * FROM note_move_locks").toArray(),
      ).toHaveLength(0);
      commit(ctx);
      expect(responses.at(-1)).toMatchObject({ status: "expired" });
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
    }));
  it("他userの結果照会はreceiptを漏らさない", () =>
    setup("move-status-user", (ctx, responses) => {
      start(ctx);
      commit(ctx);
      moveHandlers["note:move:status"]({ ...ctx, userId: B }, {
        type: "note:move:status",
        operationId: OP,
      } as ClientMessage & { type: "note:move:status" });
      expect(responses.at(-1)).toEqual({
        type: "note:move:result",
        operationId: OP,
        status: "unknown",
      });
    }));
});
describe("atomic move projection", () => {
  it("受信者ごとの票を使いprivate混合batchを他userへ送らない", () =>
    setup("move-batch-visibility", (ctx) => {
      ctx.sql.exec(
        "INSERT INTO note_vote_stickers(id,note_id,user_id,kind,x,y,created_at) VALUES (?1,?2,?3,'subjective',0.5,0.5,'now')",
        OP2,
        N1,
        A,
      );
      const payloads: string[] = [];
      const peer = {
        deserializeAttachment: () => ({
          userId: B,
          sessionExpiresAt: Math.floor(Date.now() / 1000) + 600,
        }),
        readyState: 1,
        send: (payload: string) => payloads.push(payload),
      } as unknown as WebSocket;
      const broadcaster = new RoomBroadcaster({ getWebSockets: () => [peer] });
      broadcaster.broadcastMoveBatch((viewerId) => ({
        type: "notes:moved",
        notes: [
          toProtocolNote(
            ctx.sql,
            findNote(ctx.sql, N1) as NonNullable<ReturnType<typeof findNote>>,
            viewerId,
          ),
        ],
        groups: [],
        groupRevision: 0,
      }));
      expect(
        JSON.parse(payloads[0]).notes[0].dotVotes.subjective.ownCount,
      ).toBe(0);
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N1);
      broadcaster.broadcastMoveBatch((viewerId) => ({
        type: "notes:moved",
        notes: [
          toProtocolNote(
            ctx.sql,
            findNote(ctx.sql, N1) as NonNullable<ReturnType<typeof findNote>>,
            viewerId,
          ),
        ],
        groups: [],
        groupRevision: 0,
      }));
      expect(payloads).toHaveLength(1);
    }));
});

describe("移動の失効と互換lock", () => {
  it("非memberと別phaseを混ぜた集合は拒否する", () =>
    setup("move-nonmember", (ctx, responses) => {
      start({ ...ctx, userId: OP2 });
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
      ctx.sql.exec("UPDATE notes SET phase=2 WHERE id=?1", N2);
      start(ctx, OP2);
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
      expect(
        ctx.sql.exec("SELECT * FROM note_move_locks").toArray(),
      ).toHaveLength(0);
    }));
  it.each([
    "delete",
    "visibility",
    "group",
    "map",
  ] as const)("%s変更でcommitを全拒否する", (change) =>
    setup(`move-invalid-${change}`, (ctx, responses) => {
      start(ctx);
      if (change === "delete")
        ctx.sql.exec("DELETE FROM notes WHERE id=?1", N2);
      if (change === "visibility") {
        ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N2);
        ctx.sql.exec("UPDATE notes SET visibility='shared' WHERE id=?1", N2);
      }
      if (change === "group")
        ctx.sql.exec(
          "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'変更',?2,'now','now')",
          OP2,
          JSON.stringify([N1, N2]),
        );
      if (change === "map")
        ctx.sql.exec(
          "UPDATE room_state SET idea_map_size_level=idea_map_size_level+1 WHERE id=1",
        );
      commit(ctx);
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
    }));
  it("工程の受理はlockを即時破棄し旧pointerupを保存しない", () =>
    setup("move-phase-boundary", (ctx, responses) => {
      start(ctx);
      savePhase(ctx.sql, { kind: "step", phase: 1, step: 4 });
      expect(
        ctx.sql.exec("SELECT * FROM note_move_locks").toArray(),
      ).toHaveLength(0);
      commit(ctx);
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
      expect(responses.at(-1)).toMatchObject({ status: "cancelled" });
    }));
  it("旧note:moveと旧drag:startが新集合lockを迂回しない", () =>
    setup("move-legacy-lock", (ctx, responses) => {
      start(ctx);
      noteHandlers["note:move"](ctx, {
        type: "note:move",
        noteId: N1,
        x: 600,
        y: 100,
      });
      expect(responses.at(-1)).toMatchObject({
        type: "error",
        code: "forbidden",
      });
      noteHandlers["note:drag:start"](ctx, {
        type: "note:drag:start",
        noteId: N1,
        dragId: OP2,
      });
      expect(responses.at(-1)).toMatchObject({
        type: "note:drag:result",
        accepted: false,
      });
      expect(findNote(ctx.sql, N1)?.x).toBe(100);
    }));
  it("旧clientのhalf-open lockは期限後に新moveを永久阻害しない", () =>
    setup("move-legacy-expire", (ctx, responses) => {
      ctx.ws.serializeAttachment({
        userId: A,
        sessionExpiresAt: Math.floor(Date.now() / 1000) + 600,
        activeDrag: { noteId: N1, dragId: OP2, leaseUntil: Date.now() - 1 },
      } satisfies SocketAttachment);
      start(ctx);
      expect(responses.at(-1)).toMatchObject({ status: "active" });
    }));
  it("group消滅receiptは非対象メンバーの版と名前も記録する", () =>
    setup("move-group-receipt", (ctx, responses) => {
      ctx.sql.exec(
        "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'元の名前',?2,'now','now')",
        OP2,
        JSON.stringify([N1, N2]),
      );
      start(ctx, OP, [N1]);
      moveHandlers["note:move:commit"](ctx, {
        type: "note:move:commit",
        operationId: OP,
        delta: { x: 600, y: 0 },
      });
      expect(responses.at(-1)).toMatchObject({
        status: "accepted",
        receipt: {
          groupsBefore: [{ id: OP2, name: "元の名前", noteIds: [N1, N2] }],
          groupsAfter: [],
          affected: expect.arrayContaining([
            {
              noteId: N2,
              positionRevision: 0,
              visibilityRevision: 0,
            },
          ]),
        },
      });
    }));
});

describe("move recovery entry", () => {
  it("commit ACK喪失後の閉鎖でも本人だけが実RoomDO入口でreceiptを照会できる", () =>
    setup("move-closed-status", async (ctx, responses, instance) => {
      start(ctx);
      commit(ctx);
      const accepted = responses.at(-1);
      ctx.sql.exec("UPDATE room_state SET outcome_published=1 WHERE id=1");
      const sent: ServerMessage[] = [];
      ctx.ws.send = (data) =>
        sent.push(JSON.parse(String(data)) as ServerMessage);
      const query = JSON.stringify({
        type: "note:move:status",
        operationId: OP,
      });
      await instance.webSocketMessage(ctx.ws, query);
      expect(sent.at(-1)).toEqual(accepted);
      ctx.ws.serializeAttachment({
        userId: B,
        sessionExpiresAt: Math.floor(Date.now() / 1000) + 600,
      });
      await instance.webSocketMessage(ctx.ws, query);
      expect(sent.at(-1)).toMatchObject({ status: "unknown" });
      ctx.ws.serializeAttachment({
        userId: A,
        sessionExpiresAt: Math.floor(Date.now() / 1000) + 600,
      });
      ctx.sql.exec("UPDATE note_move_operations SET created_at=0");
      await instance.webSocketMessage(ctx.ws, query);
      expect(sent.at(-1)).toEqual({
        type: "note:move:result",
        operationId: OP,
        status: "expired",
      });
      ctx.sql.exec("DELETE FROM note_move_operations");
      await instance.webSocketMessage(ctx.ws, query);
      expect(sent.at(-1)).toMatchObject({ status: "unknown" });
      ctx.sql.exec("DELETE FROM members WHERE user_id=?1", A);
      await instance.webSocketMessage(ctx.ws, query);
      expect(sent.at(-1)).toMatchObject({
        type: "note:move:result",
        status: "unknown",
      });
    }));
  it("新lock所有接続のdragging presenceを配信し別接続・秘密・全件版変更を拒否する", () =>
    setup("move-presence-owner", (ctx) => {
      const sent: ServerMessage[] = [];
      const peer = {
        readyState: 1,
        deserializeAttachment: () => ({
          userId: B,
          sessionExpiresAt: Math.floor(Date.now() / 1000) + 600,
        }),
        send: (data: string) => sent.push(JSON.parse(data) as ServerMessage),
      } as unknown as WebSocket;
      ctx.broadcaster = new RoomBroadcaster({
        getWebSockets: () => [ctx.ws, peer],
      });
      start(ctx);
      const cursor = {
        type: "cursor:update",
        x: 10,
        y: 20,
        draggingNoteId: N1,
      } as const;
      presenceHandlers["cursor:update"](ctx, cursor);
      expect(sent.at(-1)).toMatchObject({
        type: "cursor:updated",
        cursor: { draggingNoteId: N1 },
      });
      sent.length = 0;
      presenceHandlers["cursor:update"]({ ...ctx, ws: peer }, cursor);
      expect(sent).toHaveLength(0);
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N2);
      presenceHandlers["cursor:update"](ctx, cursor);
      expect(sent).toHaveLength(0);
    }));
  it("map start/cancelで全lock表示とpeer drag解除を配信する", () =>
    setup("move-map-presence", (ctx) => {
      savePhase(ctx.sql, { kind: "step", phase: 3, step: 3 });
      ctx.sql.exec("UPDATE notes SET phase=3,x=10,y=20");
      const sent: ServerMessage[] = [];
      ctx.ws.send = (data) =>
        sent.push(JSON.parse(String(data)) as ServerMessage);
      const row = ctx.sql
        .exec(
          "SELECT phase_revision,group_revision,map_revision FROM room_state WHERE id=1",
        )
        .one();
      moveHandlers["note:move:start"](ctx, {
        type: "note:move:start",
        operationId: OP,
        expectedPhaseRevision: Number(row.phase_revision),
        expectedGroupRevision: Number(row.group_revision),
        expectedMapRevision: Number(row.map_revision),
        coordinateSpace: "map",
        targets: [N1, N2].map((noteId) => {
          const note = findNote(ctx.sql, noteId);
          return {
            noteId,
            positionRevision: note?.position_revision ?? 0,
            visibilityRevision: note?.visibility_revision ?? 0,
          };
        }),
      });
      expect(sent).toContainEqual(
        expect.objectContaining({ type: "idea-map:state", isDragging: true }),
      );
      moveHandlers["note:move:cancel"](ctx, {
        type: "note:move:cancel",
        operationId: OP,
      });
      expect(sent).toContainEqual(
        expect.objectContaining({ type: "idea-map:state", isDragging: false }),
      );
      expect(sent).toContainEqual({ type: "cursor:drag-ended", userId: A });
    }));
});

it("canvas両端の集合移動deltaを受理し全対象を端まで同じdeltaでclampする", () =>
  setup("move-delta-boundary", (ctx, responses) => {
    ctx.sql.exec(
      "UPDATE notes SET x=?1 WHERE id=?2",
      -CANVAS_COORDINATE_LIMIT,
      N1,
    );
    ctx.sql.exec(
      "UPDATE notes SET x=?1 WHERE id=?2",
      -CANVAS_COORDINATE_LIMIT + 40,
      N2,
    );
    const revision = ctx.sql
      .exec(
        "SELECT phase_revision,group_revision,map_revision FROM room_state WHERE id=1",
      )
      .one();
    moveHandlers["note:move:start"](ctx, {
      type: "note:move:start",
      operationId: OP,
      expectedPhaseRevision: Number(revision.phase_revision),
      expectedGroupRevision: Number(revision.group_revision),
      expectedMapRevision: Number(revision.map_revision),
      coordinateSpace: "canvas",
      targets: [N1, N2].map((noteId) => ({
        noteId,
        positionRevision: 1,
        visibilityRevision: 0,
      })),
    });
    const message = parseClientMessage(
      JSON.stringify({
        type: "note:move:commit",
        operationId: OP,
        delta: { x: 2 * CANVAS_COORDINATE_LIMIT, y: 0 },
      }),
    );
    if (message?.type !== "note:move:commit")
      throw new Error("valid delta rejected");
    moveHandlers["note:move:commit"](ctx, message);
    expect(responses.at(-1)).toMatchObject({ status: "accepted" });
    expect(findNote(ctx.sql, N1)?.x).toBe(CANVAS_COORDINATE_LIMIT - 40);
    expect(findNote(ctx.sql, N2)?.x).toBe(CANVAS_COORDINATE_LIMIT);
  }));

it("0deltaは不可視の無関係groupをreceiptに含めず安全な成功を記録する", () =>
  setup("move-noop-hidden-group", (ctx, responses) => {
    ctx.sql.exec(
      "UPDATE notes SET visibility='private',author_id=?1 WHERE id=?2",
      B,
      N2,
    );
    ctx.sql.exec(
      "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'secret classification',?2,'now','now')",
      OP2,
      JSON.stringify([N1, N2]),
    );
    start(ctx, OP, [N1]);
    moveHandlers["note:move:commit"](ctx, {
      type: "note:move:commit",
      operationId: OP,
      delta: { x: 0, y: 0 },
    });
    const result = responses.at(-1);
    expect(result).toMatchObject({
      status: "accepted",
      receipt: {
        changed: false,
        groupsBefore: [],
        groupsAfter: [],
        affected: [{ noteId: N1 }],
      },
    });
    expect(parseServerMessage(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result)).not.toContain(N2);
    expect(JSON.stringify(result)).not.toContain("secret classification");
  }));
it("不可視group副作用を除外した不完全receiptを作らず位置も分類も全拒否する", () =>
  setup("move-hidden-group-effect-rejected", (ctx, responses) => {
    ctx.sql.exec(
      "UPDATE notes SET visibility='private',author_id=?1 WHERE id=?2",
      B,
      N2,
    );
    ctx.sql.exec(
      "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'secret classification',?2,'now','now')",
      OP2,
      JSON.stringify([N1, N2]),
    );
    start(ctx, OP, [N1]);
    moveHandlers["note:move:commit"](ctx, {
      type: "note:move:commit",
      operationId: OP,
      delta: { x: 600, y: 0 },
    });
    expect(responses.at(-1)).toMatchObject({ status: "rejected" });
    expect(findNote(ctx.sql, N1)?.x).toBe(100);
    expect(ctx.sql.exec("SELECT id FROM groups").toArray()).toEqual([
      { id: OP2 },
    ]);
    expect(JSON.stringify(responses)).not.toContain(N2);
    expect(JSON.stringify(responses)).not.toContain("secret classification");
  }));

function inverse(
  ctx: HandlerCtx,
  responses: ServerMessage[],
  sourceOperationId = OP,
  operationId = OP2,
) {
  const result = responses.findLast(
    (r) => r.type === "note:move:result" && r.operationId === sourceOperationId,
  );
  if (result?.type !== "note:move:result" || !result.receipt)
    throw new Error("missing receipt");
  const raw = {
    type: "note:move:inverse",
    operationId,
    sourceOperationId,
    expectedTargets: result.receipt.affected,
    expectedGroupRevision: result.receipt.groupRevisionAfter,
  };
  const message = parseClientMessage(JSON.stringify(raw));
  expect(message, "inverse boundary").not.toBeNull();
  if (message?.type === "note:move:inverse")
    moveHandlers["note:move:inverse"](ctx, message);
}
describe("atomic inverse", () => {
  it("他者の分類作成後に無関係な移動をしても元の移動のinverseを全拒否する", () =>
    setup("inverse-peer-group-unrelated-move", (ctx, responses) => {
      const n3 = "77777777-7777-4777-8777-777777777777";
      const note = findNote(ctx.sql, N1);
      if (!note) throw new Error("missing note");
      insertNote(ctx.sql, { ...note, id: n3, x: 2000 });
      start(ctx);
      commit(ctx);
      groupHandlers["group:create"](
        { ...ctx, userId: B },
        {
          type: "group:create",
          group: {
            id: "88888888-8888-4888-8888-888888888888",
            name: "他者の分類",
            noteIds: [N1, N2],
            createdAt: "2026-10-06T00:00:00.000Z",
            updatedAt: "2026-10-06T00:00:00.000Z",
          },
        },
      );
      const groups = listGroups(ctx.sql);
      start(ctx, OP2, [n3]);
      commit(ctx, OP2);
      expect(responses.at(-1)).toMatchObject({
        status: "accepted",
        receipt: { changed: true, groupsBefore: [], groupsAfter: [] },
      });
      const before = [findNote(ctx.sql, N1), findNote(ctx.sql, N2)];
      inverse(ctx, responses, OP, "99999999-9999-4999-8999-999999999999");
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
      expect([findNote(ctx.sql, N1), findNote(ctx.sql, N2)]).toEqual(before);
      expect(listGroups(ctx.sql)).toEqual(groups);
    }));
  it.each([
    "peer",
    "aba",
    "private",
    "delete",
    "lock",
    "member",
    "phase",
    "group",
    "map",
    "adoption",
    "owner",
  ])("%s changes reject every target", (reason) =>
    setup(`inverse-reject-${reason}`, (ctx, responses) => {
      start(ctx);
      commit(ctx);
      if (reason === "peer")
        ctx.sql.exec("UPDATE notes SET x=x+1 WHERE id=?1", N2);
      if (reason === "aba") {
        ctx.sql.exec("UPDATE notes SET x=x+1 WHERE id=?1", N2);
        ctx.sql.exec("UPDATE notes SET x=x-1 WHERE id=?1", N2);
      }
      if (reason === "private")
        ctx.sql.exec(
          "UPDATE notes SET visibility='private',author_id=?1 WHERE id=?2",
          B,
          N2,
        );
      if (reason === "delete")
        ctx.sql.exec("DELETE FROM notes WHERE id=?1", N2);
      if (reason === "lock")
        ctx.sql.exec(
          "INSERT INTO note_move_locks(note_id,operation_id) VALUES (?1,?2)",
          N2,
          OP,
        );
      if (reason === "member")
        ctx.sql.exec("DELETE FROM members WHERE user_id=?1", A);
      if (reason === "phase")
        savePhase(ctx.sql, { kind: "step", phase: 1, step: 4 });
      if (reason === "group")
        ctx.sql.exec(
          "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'peer group',?2,'now','now')",
          OP2,
          JSON.stringify([N1, N2]),
        );
      if (reason === "map")
        ctx.sql.exec(
          "UPDATE room_state SET map_revision=map_revision+1 WHERE id=1",
        );
      if (reason === "adoption")
        ctx.sql.exec(
          "INSERT INTO decisions(phase,note_id,decided_by,decided_at) VALUES(1,?1,?2,'now')",
          N1,
          A,
        );
      const before = [findNote(ctx.sql, N1), findNote(ctx.sql, N2)];
      inverse(
        reason === "owner" ? { ...ctx, userId: B } : ctx,
        responses,
        OP,
        "77777777-7777-4777-8777-777777777777",
      );
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
      expect([findNote(ctx.sql, N1), findNote(ctx.sql, N2)]).toEqual(before);
      expect(JSON.stringify(responses.at(-1))).not.toContain(N2);
    }));
  it("restores positions atomically and preserves latest stack/content; retry and status are idempotent", () =>
    setup("inverse-success", (ctx, responses) => {
      start(ctx);
      commit(ctx);
      ctx.sql.exec(
        "UPDATE notes SET content='peer content',stack_order=900 WHERE id=?1",
        N1,
      );
      ctx.sql.exec(
        "UPDATE note_appearances SET font_size=20 WHERE note_id=?1",
        N1,
      );
      inverse(ctx, responses);
      expect(responses.at(-1)).toMatchObject({
        status: "accepted",
        receipt: { changed: true },
      });
      expect(findNote(ctx.sql, N1)).toMatchObject({
        x: 100,
        content: "peer content",
        font_size: 20,
        stack_order: 900,
        position_revision: 2,
      });
      expect(findNote(ctx.sql, N2)?.x).toBe(140);
      inverse(ctx, responses);
      expect(findNote(ctx.sql, N1)?.position_revision).toBe(2);
      moveHandlers["note:move:status"](ctx, {
        type: "note:move:status",
        operationId: OP2,
      });
      expect(responses.at(-1)).toMatchObject({ status: "accepted" });
      inverse(ctx, responses, OP2, "77777777-7777-4777-8777-777777777777");
      expect(findNote(ctx.sql, N1)?.x).toBe(400);
    }));
});
it("unrelated group edits do not invalidate inverse; group ABA on affected IDs does", () =>
  setup("inverse-related-groups", (ctx, responses) => {
    start(ctx);
    commit(ctx);
    ctx.sql.exec(
      "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'unrelated',?2,'now','now')",
      "88888888-8888-4888-8888-888888888888",
      JSON.stringify([A, B]),
    );
    inverse(ctx, responses);
    expect(responses.at(-1)).toMatchObject({ status: "accepted" });
  }));
it("restores vanished group ID/name/membership and guards affected outsider lock", () =>
  setup("inverse-group-restore", (ctx, responses) => {
    ctx.sql.exec(
      "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'original group',?2,'now','now')",
      OP2,
      JSON.stringify([N1, N2]),
    );
    start(ctx, OP, [N1]);
    moveHandlers["note:move:commit"](ctx, {
      type: "note:move:commit",
      operationId: OP,
      delta: { x: 600, y: 0 },
    });
    expect(
      ctx.sql.exec("SELECT id FROM groups WHERE id=?1", OP2).toArray(),
    ).toEqual([]);
    inverse(ctx, responses, OP, "77777777-7777-4777-8777-777777777777");
    expect(responses.at(-1)).toMatchObject({ status: "accepted" });
    expect(
      ctx.sql.exec("SELECT name,note_ids FROM groups WHERE id=?1", OP2).one(),
    ).toMatchObject({
      name: "original group",
      note_ids: JSON.stringify([N1, N2]),
    });
  }));
it("two consecutive moves undo and redo twice with server-proven rebased revisions", () =>
  setup("inverse-sequence", (ctx, responses) => {
    start(ctx);
    commit(ctx);
    const row = ctx.sql
      .exec(
        "SELECT phase_revision,group_revision,map_revision FROM room_state WHERE id=1",
      )
      .one();
    moveHandlers["note:move:start"](ctx, {
      type: "note:move:start",
      operationId: OP2,
      coordinateSpace: "canvas",
      expectedPhaseRevision: Number(row.phase_revision),
      expectedGroupRevision: Number(row.group_revision),
      expectedMapRevision: Number(row.map_revision),
      targets: [N1, N2].map((noteId) => {
        const n = findNote(ctx.sql, noteId);
        return {
          noteId,
          positionRevision: n?.position_revision ?? 0,
          visibilityRevision: n?.visibility_revision ?? 0,
        };
      }),
    });
    commit(ctx, OP2);
    const invert = (sourceOperationId: string, operationId: string) => {
      const source = responses.findLast(
        (r) =>
          r.type === "note:move:result" && r.operationId === sourceOperationId,
      );
      if (source?.type !== "note:move:result" || !source.receipt)
        throw new Error("missing");
      moveHandlers["note:move:inverse"](ctx, {
        type: "note:move:inverse",
        operationId,
        sourceOperationId,
        expectedGroupRevision: Number(
          ctx.sql.exec("SELECT group_revision FROM room_state WHERE id=1").one()
            .group_revision,
        ),
        expectedTargets: source.receipt.affected.map((target) => {
          const n = findNote(ctx.sql, target.noteId);
          return {
            noteId: target.noteId,
            positionRevision: n?.position_revision ?? 0,
            visibilityRevision: n?.visibility_revision ?? 0,
          };
        }),
      });
      expect(responses.at(-1)).toMatchObject({ status: "accepted" });
    };
    const undo2 = "77777777-7777-4777-8777-777777777777",
      undo1 = "88888888-8888-4888-8888-888888888888";
    invert(OP2, undo2);
    expect(findNote(ctx.sql, N1)?.x).toBe(400);
    invert(OP, undo1);
    expect(findNote(ctx.sql, N1)?.x).toBe(100);
    invert(undo1, "99999999-9999-4999-8999-999999999999");
    expect(findNote(ctx.sql, N1)?.x).toBe(400);
    invert(undo2, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(findNote(ctx.sql, N1)?.x).toBe(700);
  }));
it.each([
  "aba",
  "outsider-lock",
  "forged-position",
])("related %s rejects atomic inverse", (reason) =>
  setup(`inverse-extra-${reason}`, (ctx, responses) => {
    ctx.sql.exec(
      "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'original',?2,'now','now')",
      OP2,
      JSON.stringify([N1, N2]),
    );
    start(ctx, OP, [N1]);
    moveHandlers["note:move:commit"](ctx, {
      type: "note:move:commit",
      operationId: OP,
      delta: { x: 600, y: 0 },
    });
    if (reason === "aba") {
      ctx.sql.exec(
        "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'peer',?2,'now','now')",
        OP2,
        JSON.stringify([N1, N2]),
      );
      ctx.sql.exec("DELETE FROM groups WHERE id=?1", OP2);
    }
    if (reason === "outsider-lock")
      ctx.sql.exec(
        "INSERT INTO note_move_locks(note_id,operation_id) VALUES (?1,?2)",
        N2,
        OP,
      );
    const before = [findNote(ctx.sql, N1), findNote(ctx.sql, N2)];
    if (reason === "forged-position") {
      ctx.sql.exec("UPDATE notes SET x=x+1 WHERE id=?1", N1);
      ctx.sql.exec("UPDATE notes SET x=x-1 WHERE id=?1", N1);
      const result = responses.at(-1);
      if (result?.type !== "note:move:result" || !result.receipt)
        throw new Error("missing");
      moveHandlers["note:move:inverse"](ctx, {
        type: "note:move:inverse",
        operationId: "77777777-7777-4777-8777-777777777777",
        sourceOperationId: OP,
        expectedGroupRevision: result.receipt.groupRevisionAfter,
        expectedTargets: result.receipt.affected.map((t) => ({
          ...t,
          positionRevision: findNote(ctx.sql, t.noteId)?.position_revision ?? 0,
        })),
      });
    } else inverse(ctx, responses, OP, "77777777-7777-4777-8777-777777777777");
    expect(responses.at(-1)).toMatchObject({ status: "rejected" });
    expect(findNote(ctx.sql, N1)?.x).toBe(before[0]?.x);
    expect(findNote(ctx.sql, N2)).toEqual(before[1]);
  }));

it("unrelated regrouping preserves the related group revision", () =>
  setup("inverse-group-diff", (ctx, responses) => {
    ctx.sql.exec(
      "INSERT INTO groups(id,name,note_ids,created_at,updated_at) VALUES (?1,'original',?2,'now','now')",
      OP2,
      JSON.stringify([N1, N2]),
    );
    start(ctx);
    commit(ctx);
    saveGroups(ctx.storage, [
      ...listGroups(ctx.sql),
      {
        id: "88888888-8888-4888-8888-888888888888",
        name: "unrelated",
        noteIds: [A, B],
      },
    ]);
    inverse(ctx, responses);
    expect(responses.at(-1)).toMatchObject({ status: "accepted" });
  }));
