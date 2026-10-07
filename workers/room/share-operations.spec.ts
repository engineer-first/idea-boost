import { describe, expect, it, vi } from "vitest";
import type {
  ClientMessage,
  ServerMessage,
} from "../../contracts/room-protocol";
import { runInRoomDO } from "../test-helpers";
import { RoomBroadcaster, type SocketAttachment } from "./broadcast";
import type { HandlerCtx } from "./handler-context";
import { moveHandlers } from "./move-operations";
import { noteHandlers } from "./note-handlers";
import { findNote, insertNote } from "./notes";
import { savePhase } from "./phase";
import type { RoomDO } from "./room-do";
import { commitShare, replyShareStatus } from "./share-operations";
import { saveSharingState } from "./sharing-state";

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
    saveSharingState(state.storage.sql, {
      revision: crypto.randomUUID(),
      order: [{ userId: A, name: "作者", color: "yellow" }],
      status: "active",
      currentIndex: 0,
      results: [],
      durationMs: 180000,
      startsAt: null,
    });
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
    let attachment: SocketAttachment = { userId: A };
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
function peer(ctx: HandlerCtx, userId = B) {
  const messages: Record<string, unknown>[] = [];
  const socket = {
    deserializeAttachment: () => ({ userId }),
    readyState: 1,
    send: (payload: string) => messages.push(JSON.parse(payload)),
  } as unknown as WebSocket;
  ctx.broadcaster = new RoomBroadcaster({
    getWebSockets: () => [ctx.ws, socket],
  });
  return messages;
}
describe("share commit", () => {
  it("非author・古い版・他工程は公開せず、作者の有効確定のみ他者へ初回配信する", () =>
    setup("share-private-boundary", (ctx) => {
      const messages = peer(ctx);
      savePhase(ctx.sql, { kind: "step", phase: 1, step: 2 });
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N1);
      const message = {
        type: "note:publish",
        operationId: OP,
        noteId: N1,
        x: 200,
        y: 210,
        expectedPhaseRevision: Number(
          ctx.sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
            .phase_revision,
        ),
        expectedPositionRevision: 0,
        expectedVisibilityRevision: 1,
      };
      noteHandlers["note:publish"](
        { ...ctx, userId: B },
        message as Extract<ClientMessage, { type: "note:publish" }>,
      );
      expect(findNote(ctx.sql, N1)?.visibility).toBe("private");
      expect(messages).toHaveLength(0);
      noteHandlers["note:publish"](ctx, {
        ...message,
        operationId: OP2,
        expectedVisibilityRevision: 0,
      } as Extract<ClientMessage, { type: "note:publish" }>);
      expect(findNote(ctx.sql, N1)?.visibility).toBe("private");
      expect(messages).toHaveLength(0);
    }));
  it("確定とreceiptは原子的・同じID再送は一度だけ配信し、作者だけが照会できる", () =>
    setup("share-receipt-idempotent", (ctx, responses) => {
      const messages = peer(ctx);
      savePhase(ctx.sql, { kind: "step", phase: 2, step: 2 });
      ctx.sql.exec(
        "UPDATE notes SET visibility='private',phase=2 WHERE id=?1",
        N1,
      );
      const message = {
        type: "note:publish" as const,
        operationId: OP,
        noteId: N1,
        x: 200,
        y: 210,
        expectedPhaseRevision: Number(
          ctx.sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
            .phase_revision,
        ),
        expectedPositionRevision: 0,
        expectedVisibilityRevision: 1,
      };
      noteHandlers["note:publish"](ctx, message);
      expect(responses.at(-1)).toMatchObject({
        type: "note:share:result",
        status: "committed",
        receipt: {
          before: {
            visibility: "private",
            x: 100,
            positionRevision: 0,
            visibilityRevision: 1,
          },
          after: {
            visibility: "shared",
            x: 200,
            y: 210,
            positionRevision: 1,
            visibilityRevision: 2,
          },
        },
      });
      expect(
        messages.find((item) => item.type === "note:inserted"),
      ).toMatchObject({ note: { positionRevision: 1, visibilityRevision: 2 } });
      const firstCount = messages.length;
      expect(messages.some((item) => item.type === "note:inserted")).toBe(true);
      noteHandlers["note:publish"](ctx, message);
      expect(messages).toHaveLength(firstCount);
      replyShareStatus({ ...ctx, userId: B }, OP);
      expect(responses.at(-1)).toEqual({
        type: "note:share:result",
        operationId: OP,
        status: "unknown",
      });
      replyShareStatus(ctx, OP);
      expect(responses.at(-1)).toMatchObject({
        status: "committed",
        receipt: { noteId: N1 },
      });
      savePhase(ctx.sql, { kind: "step", phase: 3, step: 1 });
      replyShareStatus(ctx, OP);
      expect(responses.at(-1)).toEqual({
        type: "note:share:result",
        operationId: OP,
        status: "committed",
      });
    }));
  it("有効戻しは作者のprivate順序に挿入し、競合・旧版の戻しを拒否する", () =>
    setup("share-return-atomic", (ctx, responses) => {
      const messages = peer(ctx);
      savePhase(ctx.sql, { kind: "step", phase: 1, step: 2 });
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N2);
      const message = {
        type: "note:unpublish" as const,
        operationId: OP,
        noteId: N1,
        privateIndex: 0,
        expectedPhaseRevision: Number(
          ctx.sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
            .phase_revision,
        ),
        expectedPositionRevision: 0,
        expectedVisibilityRevision: 0,
      };
      noteHandlers["note:unpublish"](ctx, message);
      expect(responses.at(-1)).toMatchObject({
        status: "committed",
        receipt: {
          before: { visibility: "shared" },
          after: { visibility: "private" },
          privateIndex: 0,
        },
      });
      expect(
        messages.filter((item) => item.type === "note:deleted"),
      ).toHaveLength(1);
      expect(messages.some((item) => item.type === "note:inserted")).toBe(
        false,
      );
      expect(Number(findNote(ctx.sql, N1)?.stack_order)).toBeLessThan(
        Number(findNote(ctx.sql, N2)?.stack_order),
      );
      noteHandlers["note:unpublish"](ctx, { ...message, operationId: OP2 });
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
    }));
  it("他接続の移動lockがあるshared付箋は0件戻し、他者表示を消さない", () =>
    setup("share-return-lock", (ctx, responses) => {
      const messages = peer(ctx);
      savePhase(ctx.sql, { kind: "step", phase: 1, step: 2 });
      start(ctx, OP, [N1]);
      noteHandlers["note:unpublish"](ctx, {
        type: "note:unpublish",
        operationId: OP2,
        noteId: N1,
        privateIndex: 0,
        expectedPhaseRevision: Number(
          ctx.sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
            .phase_revision,
        ),
        expectedPositionRevision: 0,
        expectedVisibilityRevision: 0,
      });
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
      expect(findNote(ctx.sql, N1)?.visibility).toBe("shared");
      expect(messages.some((item) => item.type === "note:deleted")).toBe(false);
    }));
  it.each([
    "nonmember",
    "phase",
    "position",
    "excluded",
    "step",
  ])("%sの公開要求はprivate本文を配信しない", (kind) =>
    setup(`share-reject-${kind}`, (ctx, responses) => {
      const messages = peer(ctx);
      savePhase(ctx.sql, { kind: "step", phase: 1, step: 2 });
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N1);
      if (kind === "step")
        savePhase(ctx.sql, { kind: "step", phase: 1, step: 1 });
      const revision = Number(
        ctx.sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
          .phase_revision,
      );
      if (kind === "excluded")
        ctx.sql.exec("UPDATE notes SET excluded=1 WHERE id=?1", N1);
      if (kind === "nonmember")
        ctx.sql.exec("DELETE FROM members WHERE user_id=?1", A);
      noteHandlers["note:publish"](ctx, {
        type: "note:publish",
        operationId: OP,
        noteId: N1,
        x: 200,
        y: 210,
        expectedPhaseRevision: kind === "phase" ? revision - 1 : revision,
        expectedPositionRevision: kind === "position" ? 9 : 0,
        expectedVisibilityRevision: 1,
      });
      expect(findNote(ctx.sql, N1)?.visibility).toBe("private");
      expect(responses.at(-1)).toMatchObject({ status: "rejected" });
      expect(messages).toHaveLength(0);
    }));
  it("期限削除の保存失敗中でも共有結果照会はunknownで終端しpendingを残さない", () =>
    setup(
      "share-status-retention-failure",
      async (ctx, responses, instance) => {
        ctx.ws.send = (message) =>
          responses.push(JSON.parse(String(message)) as ServerMessage);
        const transition = vi
          .spyOn(
            instance as unknown as {
              processExpiredTransition: () => Promise<boolean>;
            },
            "processExpiredTransition",
          )
          .mockResolvedValue(false);
        try {
          await instance.webSocketMessage(
            ctx.ws,
            JSON.stringify({ type: "note:share:status", operationId: OP }),
          );
          expect(responses.at(-1)).toEqual({
            type: "note:share:result",
            operationId: OP,
            status: "unknown",
          });
        } finally {
          transition.mockRestore();
        }
      },
    ));
  it("同IDを別人が再commitしても再公開せず、期限・削除・除外後はreceiptを漏らさない", () =>
    setup("share-result-lifetime", (ctx, responses) => {
      const messages = peer(ctx);
      savePhase(ctx.sql, { kind: "step", phase: 1, step: 2 });
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N1);
      const message = {
        type: "note:publish" as const,
        operationId: OP,
        noteId: N1,
        x: 200,
        y: 210,
        expectedPhaseRevision: Number(
          ctx.sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
            .phase_revision,
        ),
        expectedPositionRevision: 0,
        expectedVisibilityRevision: 1,
      };
      noteHandlers["note:publish"](ctx, message);
      const count = messages.length;
      noteHandlers["note:publish"](
        { ...ctx, userId: B },
        { ...message, x: 900 },
      );
      expect(responses.at(-1)).toEqual({
        type: "note:share:result",
        operationId: OP,
        status: "unknown",
      });
      expect(messages).toHaveLength(count);
      expect(findNote(ctx.sql, N1)?.x).toBe(200);
      ctx.sql.exec("DELETE FROM notes WHERE id=?1", N1);
      replyShareStatus(ctx, OP);
      expect(responses.at(-1)).toEqual({
        type: "note:share:result",
        operationId: OP,
        status: "committed",
      });
      ctx.sql.exec(
        "UPDATE note_share_operations SET created_at=?2 WHERE operation_id=?1",
        OP,
        Date.now() - 24 * 60 * 60 * 1000 - 1,
      );
      replyShareStatus(ctx, OP);
      expect(responses.at(-1)).toEqual({
        type: "note:share:result",
        operationId: OP,
        status: "expired",
      });
      ctx.sql.exec("DELETE FROM members WHERE user_id=?1", A);
      replyShareStatus(ctx, OP);
      expect(responses.at(-1)).toEqual({
        type: "note:share:result",
        operationId: OP,
        status: "unknown",
      });
    }));
  it("永続化失敗は位置/可視性/receiptを一緒にrollbackし、公開通知を送らない", () =>
    setup("share-atomic-rollback", (ctx) => {
      const messages = peer(ctx);
      savePhase(ctx.sql, { kind: "step", phase: 1, step: 2 });
      ctx.sql.exec("UPDATE notes SET visibility='private' WHERE id=?1", N1);
      const message = {
        type: "note:publish" as const,
        operationId: OP,
        noteId: N1,
        x: 200,
        y: 210,
        expectedPhaseRevision: Number(
          ctx.sql.exec("SELECT phase_revision FROM room_state WHERE id=1").one()
            .phase_revision,
        ),
        expectedPositionRevision: 0,
        expectedVisibilityRevision: 1,
      };
      expect(() =>
        commitShare(ctx, message, (nextCtx, clean) => {
          if (clean.type === "note:publish")
            noteHandlers["note:publish"](nextCtx, clean);
          nextCtx.sql.exec("INSERT INTO missing_share_storage VALUES (1)");
        }),
      ).toThrow();
      expect(findNote(ctx.sql, N1)).toMatchObject({
        visibility: "private",
        x: 100,
        y: 100,
        position_revision: 0,
        visibility_revision: 1,
      });
      expect(
        ctx.sql.exec("SELECT * FROM note_share_operations").toArray(),
      ).toHaveLength(0);
      expect(messages).toHaveLength(0);
    }));
});
