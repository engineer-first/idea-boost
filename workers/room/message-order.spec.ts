import { afterEach, expect, it, vi } from "vitest";
import type {
  ClientMessage,
  ServerMessage,
} from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
} from "../test-helpers";
import { findNote, insertNote } from "./notes";
import { getPhaseRevision, savePhase } from "./phase";
import { saveTimerState } from "./timer";

const A = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "a@test.example",
  name: "ホスト",
};
const B = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "b@test.example",
  name: "参加者",
};
const noteId = "33333333-3333-4333-8333-333333333333";
const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

it.each([
  "commit",
  "cancel",
] as const)("移動開始の参加確認が遅れてもpreview・%s・照会を受信順に処理し、別接続を待たせない", async (end) => {
  const { roomId, inviteCode } = await createRoomAs(A);
  await joinRoomAs(B, inviteCode);
  for (const user of [A, B]) {
    const socket = await connectRoomAs(user, roomId);
    sockets.push(socket);
    await socket.next();
  }
  await runInRoomDO(roomId, async (room, state) => {
    const sql = state.storage.sql;
    savePhase(sql, { kind: "step", phase: 1, step: 2 });
    saveTimerState(sql, {
      status: "running",
      endsAt: Date.now() + 60_000,
      durationMs: 60_000,
    });
    insertNote(sql, {
      id: noteId,
      author_id: A.sub,
      content: "共有中の付箋",
      visibility: "shared",
      color: "yellow",
      font_size: 14,
      x: 100,
      y: 100,
      stack_order: 0,
      phase: 1,
      excluded: false,
      created_at: "2026-10-16T00:00:00.000Z",
      updated_at: "2026-10-16T00:00:00.000Z",
    });
    const socketFor = (userId: string) => {
      const socket = state
        .getWebSockets()
        .find((ws) => ws.deserializeAttachment().userId === userId);
      if (!socket) throw new Error("テスト用ソケットがありません");
      return socket;
    };
    const ws = socketFor(A.sub);
    const peer = socketFor(B.sub);
    const entered = Promise.withResolvers<void>();
    const permission = Promise.withResolvers<boolean>();
    let checks = 0;
    const runtime = room as unknown as { env: Env };
    const lookup = vi.spyOn(runtime.env.ACCOUNT_DO, "get").mockReturnValue({
      mayOperate: async (userId: string) => {
        if (userId === A.sub && ++checks === 1) {
          entered.resolve();
          return permission.promise;
        }
        return true;
      },
    } as never);
    const replies: ServerMessage[] = [];
    const send = vi.spyOn(ws, "send").mockImplementation((data) => {
      replies.push(JSON.parse(String(data)) as ServerMessage);
    });
    const operationId = crypto.randomUUID();
    const dispatch = (message: ClientMessage, socket = ws) =>
      room.webSocketMessage(socket, JSON.stringify(message));
    const pending: Promise<void>[] = [];
    try {
      pending.push(
        dispatch({
          type: "note:move:start",
          operationId,
          expectedPhaseRevision: getPhaseRevision(sql),
          expectedGroupRevision: 0,
          expectedMapRevision: 0,
          coordinateSpace: "canvas",
          targets: [{ noteId, positionRevision: 0, visibilityRevision: 0 }],
        }),
      );
      await entered.promise;
      pending.push(
        dispatch({
          type: "note:move:preview",
          operationId,
          delta: { x: 150, y: 50 },
        }),
      );
      pending.push(
        dispatch({
          ...(end === "commit"
            ? { type: "note:move:commit" as const, delta: { x: 300, y: 80 } }
            : { type: "note:move:cancel" as const }),
          operationId,
        }),
      );
      pending.push(dispatch({ type: "note:move:status", operationId }));
      // Aの参加確認を保留したまま、Bの要求は完了できる。
      await dispatch({ type: "note:move:status", operationId }, peer);
      permission.resolve(true);
      await Promise.all(pending);
      expect(
        replies.filter((message) => message.type === "note:move:result"),
      ).toEqual([
        expect.objectContaining({ operationId, status: "active" }),
        expect.objectContaining({
          operationId,
          status: end === "commit" ? "accepted" : "cancelled",
        }),
        expect.objectContaining({
          operationId,
          status: end === "commit" ? "accepted" : "cancelled",
        }),
      ]);
      expect(findNote(sql, noteId)).toMatchObject({
        x: end === "commit" ? 400 : 100,
        y: end === "commit" ? 180 : 100,
        position_revision: end === "commit" ? 1 : 0,
      });
      expect(sql.exec("SELECT * FROM note_move_locks").toArray()).toEqual([]);
      expect(checks).toBe(4);
    } finally {
      permission.resolve(true);
      await Promise.allSettled(pending);
      lookup.mockRestore();
      send.mockRestore();
    }
  });
});
