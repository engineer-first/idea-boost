import { env } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import { parseServerMessage } from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  runInRoomDO,
} from "../test-helpers";

import { getSharingState, saveSharingState } from "./sharing-state";

const owner = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  name: "Owner",
};
const peer = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "peer@example.test",
  name: "Peer",
};
const oldNote = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const newNote = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const operationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const dragId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function insertNote(
  state: DurableObjectState,
  id: string,
  userId: string,
  visibility = "private",
) {
  state.storage.sql.exec(
    "INSERT INTO notes(id,author_id,content,visibility,color,x,y,phase,created_at,updated_at) VALUES (?1,?2,'確定済み本文',?3,'yellow',0,0,1,?4,?4)",
    id,
    userId,
    visibility,
    new Date().toISOString(),
  );
}

it.each([
  "expiry-equal",
  "expiry-after",
  "kick",
])("本文digestの非同期待機中に%sとなる保存を確定しない", async (boundary) => {
  const { roomId, inviteCode } = await createRoomAs(owner);
  await joinRoomAs(peer, inviteCode);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
    buildPhaseStep(1),
    owner.sub,
  );
  const connection = await connectRoomAs(peer, roomId);
  await connection.next();
  await runInRoomDO(roomId, async (instance, state) => {
    insertNote(state, oldNote, peer.sub);
    const revision = Number(
      state.storage.sql
        .exec("SELECT phase_revision FROM room_state WHERE id=1")
        .one().phase_revision,
    );
    const socket = state.getWebSockets()[0];
    const expiry = Math.floor(Date.now() / 1000) + 60;
    socket.serializeAttachment({
      ...socket.deserializeAttachment(),
      sessionExpiresAt: expiry,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((expiry - 1) * 1000);
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    const paused = vi
      .spyOn(crypto.subtle, "digest")
      .mockImplementation(async (...args) => {
        const result = await digest(...args);
        if (boundary === "kick") {
          // キックの本番処理で接続を閉じ、確定済み本文を残す。
          await instance.leave(peer.sub, "discard");
        } else
          vi.setSystemTime(
            (expiry + (boundary === "expiry-after" ? 1 : 0)) * 1000,
          );
        return result;
      });
    try {
      await instance.webSocketMessage(
        socket,
        JSON.stringify({
          type: "note:update-content",
          noteId: oldNote,
          content: "期限後の上書き",
          operationId,
          expectedContentRevision: 0,
          expectedPhaseRevision: revision,
        }),
      );
      expect(
        state.storage.sql
          .exec("SELECT content FROM notes WHERE id=?1", oldNote)
          .one().content,
      ).toBe("確定済み本文");
      expect(
        state.storage.sql.exec("SELECT * FROM note_content_receipts").toArray(),
      ).toEqual([]);
    } finally {
      paused.mockRestore();
      vi.useRealTimers();
    }
  });
  connection.close();
});

it.each([
  "legacy",
  "move",
  "lease-alarm",
])("旧%s接続の失効cleanupは新しい同一本人dragを第三者の受信状態から消さない", async (kind) => {
  const { roomId, inviteCode } = await createRoomAs(owner);
  await joinRoomAs(peer, inviteCode);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
    buildPhaseStep(2),
    owner.sub,
  );
  const old = await connectRoomAs(owner, roomId);
  await old.next();
  const fresh = await connectRoomAs(owner, roomId);
  await fresh.next();
  const observer = await connectRoomAs(peer, roomId);
  await observer.next();
  await runInRoomDO(roomId, async (instance, state) => {
    insertNote(state, oldNote, owner.sub, "shared");
    insertNote(state, newNote, owner.sub, "shared");
    const [expired, valid] = state
      .getWebSockets()
      .filter((socket) => socket.deserializeAttachment().userId === owner.sub);
    const recipient = state
      .getWebSockets()
      .find((socket) => socket.deserializeAttachment().userId === peer.sub);
    if (!recipient) throw new Error("observer missing");
    if (kind !== "move") {
      await instance.webSocketMessage(
        expired,
        JSON.stringify({ type: "note:drag:start", noteId: oldNote, dragId }),
      );
    } else {
      const revisions = state.storage.sql
        .exec(
          "SELECT phase_revision,group_revision,map_revision FROM room_state WHERE id=1",
        )
        .one();
      await instance.webSocketMessage(
        expired,
        JSON.stringify({
          type: "note:move:start",
          operationId,
          expectedPhaseRevision: Number(revisions.phase_revision),
          expectedGroupRevision: Number(revisions.group_revision),
          expectedMapRevision: Number(revisions.map_revision),
          coordinateSpace: "canvas",
          targets: [
            { noteId: oldNote, positionRevision: 0, visibilityRevision: 0 },
          ],
        }),
      );
    }
    expect(
      expired.deserializeAttachment()[
        kind !== "move" ? "activeDrag" : "activeMoveOperationId"
      ],
    ).toBeDefined();
    await instance.webSocketMessage(
      valid,
      JSON.stringify({
        type: "note:drag:start",
        noteId: newNote,
        dragId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      }),
    );
    const wire = vi.spyOn(recipient, "send");
    const cleanup = vi.spyOn(instance, "webSocketClose");
    try {
      await instance.webSocketMessage(
        valid,
        JSON.stringify({
          type: "cursor:update",
          x: 100,
          y: 100,
          draggingNoteId: newNote,
        }),
      );
      expect(
        wire.mock.calls.map(([payload]) => parseServerMessage(payload)),
      ).toContainEqual(
        expect.objectContaining({
          type: "cursor:updated",
          cursor: expect.objectContaining({
            userId: owner.sub,
            draggingNoteId: newNote,
          }),
        }),
      );
      wire.mockClear();
      const attachment = expired.deserializeAttachment();
      expired.serializeAttachment({
        ...attachment,
        sessionExpiresAt: 1,
        ...(kind === "lease-alarm"
          ? { activeDrag: { ...attachment.activeDrag, leaseUntil: 0 } }
          : {}),
      });
      if (kind === "lease-alarm") await instance.alarm();
      else
        await instance.webSocketMessage(
          expired,
          JSON.stringify({ type: "invalid" }),
        );
      await cleanup.mock.results[0]?.value;
      // cursor reducerはuserId単位のended/leftで新しいdragまで消すため、第三者へのwireで防ぐ。
      const messages = wire.mock.calls.map(([payload]) =>
        parseServerMessage(payload),
      );
      expect(messages).not.toContainEqual({
        type: "cursor:drag-ended",
        userId: owner.sub,
      });
      expect(messages).not.toContainEqual({
        type: "cursor:left",
        userId: owner.sub,
      });
      expect(valid.deserializeAttachment().activeDrag.noteId).toBe(newNote);
      expect(valid.readyState).toBe(WebSocket.OPEN);
    } finally {
      wire.mockRestore();
      cleanup.mockRestore();
    }
  });
  old.close();
  fresh.close();
  observer.close();
});

it.each([
  "reservation",
  "next",
  "restart",
])("%sの非同期確定前に期限を越えた進行要求を予約・確定しない", async (action) => {
  const { roomId } = await createRoomAs(owner);
  const initial = buildPhaseStep(action === "reservation" ? 1 : 3);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
    initial,
    owner.sub,
  );
  const connection = await connectRoomAs(owner, roomId);
  await connection.next();
  await runInRoomDO(roomId, async (instance, state) => {
    insertNote(state, oldNote, owner.sub, "shared");
    const revision = Number(
      state.storage.sql
        .exec("SELECT phase_revision FROM room_state WHERE id=1")
        .one().phase_revision,
    );
    const socket = state.getWebSockets()[0];
    const expiry = Math.floor(Date.now() / 1000) + 60;
    socket.serializeAttachment({
      ...socket.deserializeAttachment(),
      sessionExpiresAt: expiry,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((expiry - 1) * 1000);
    const asyncTransaction = state.storage.transaction.bind(state.storage);
    const syncTransaction = state.storage.transactionSync.bind(state.storage);
    const delayed =
      action === "restart"
        ? vi
            .spyOn(state.storage, "transactionSync")
            .mockImplementation((callback) => {
              vi.setSystemTime(expiry * 1000);
              return syncTransaction(callback);
            })
        : vi
            .spyOn(state.storage, "transaction")
            .mockImplementation((callback) => {
              vi.setSystemTime(expiry * 1000);
              return asyncTransaction(callback);
            });
    try {
      await instance.webSocketMessage(
        socket,
        JSON.stringify({
          type: action === "restart" ? "phase:restart-writing" : "phase:next",
          expectedPhase: initial,
          expectedRevision: revision,
        }),
      );
      expect(instance.getPhase()).toEqual(initial);
      expect(
        state.storage.sql
          .exec("SELECT * FROM pending_phase_transition")
          .toArray(),
      ).toEqual([]);
    } finally {
      delayed.mockRestore();
      vi.useRealTimers();
    }
  });
  connection.close();
});

it.each([
  "reservation",
  "next",
])("%sのtransaction内alarm待機中に期限を越えた未確定進行をrollbackする", async (action) => {
  const { roomId } = await createRoomAs(owner);
  const initial = buildPhaseStep(action === "reservation" ? 1 : 3);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
    initial,
    owner.sub,
  );
  const connection = await connectRoomAs(owner, roomId);
  await connection.next();
  await runInRoomDO(roomId, async (instance, state) => {
    insertNote(state, oldNote, owner.sub, "shared");
    const revision = Number(
      state.storage.sql
        .exec("SELECT phase_revision FROM room_state WHERE id=1")
        .one().phase_revision,
    );
    const socket = state.getWebSockets()[0];
    const expiry = Math.floor(Date.now() / 1000) + 60;
    socket.serializeAttachment({
      ...socket.deserializeAttachment(),
      sessionExpiresAt: expiry,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((expiry - 1) * 1000);
    const setAlarm = state.storage.setAlarm.bind(state.storage);
    const delayed = vi
      .spyOn(state.storage, "setAlarm")
      .mockImplementation(async (...args) => {
        await setAlarm(...args);
        vi.setSystemTime(expiry * 1000);
      });
    try {
      await instance.webSocketMessage(
        socket,
        JSON.stringify({
          type: "phase:next",
          expectedPhase: initial,
          expectedRevision: revision,
        }),
      );
      expect(instance.getPhase()).toEqual(initial);
      expect(
        state.storage.sql
          .exec("SELECT * FROM pending_phase_transition")
          .toArray(),
      ).toEqual([]);
      expect(socket.readyState).not.toBe(WebSocket.OPEN);
    } finally {
      delayed.mockRestore();
      vi.useRealTimers();
    }
  });
  connection.close();
});

it("期限前に確定済みの進行予約は元接続が失効してもalarmで実行する", async () => {
  const { roomId } = await createRoomAs(owner);
  const initial = buildPhaseStep(1);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
    initial,
    owner.sub,
  );
  const connection = await connectRoomAs(owner, roomId);
  await connection.next();
  await runInRoomDO(roomId, async (instance, state) => {
    const revision = Number(
      state.storage.sql
        .exec("SELECT phase_revision FROM room_state WHERE id=1")
        .one().phase_revision,
    );
    const socket = state.getWebSockets()[0];
    const now = Math.floor(Date.now() / 1000) * 1000;
    socket.serializeAttachment({
      ...socket.deserializeAttachment(),
      sessionExpiresAt: now / 1000 + 1,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    try {
      await instance.webSocketMessage(
        socket,
        JSON.stringify({
          type: "phase:next",
          expectedPhase: initial,
          expectedRevision: revision,
        }),
      );
      const pending = state.storage.sql
        .exec("SELECT deadline_at FROM pending_phase_transition")
        .one();
      vi.setSystemTime(Number(pending.deadline_at));
      await instance.alarm();
      expect(instance.getPhase()).toEqual(buildPhaseStep(2));
      expect(
        state.storage.sql
          .exec("SELECT * FROM pending_phase_transition")
          .toArray(),
      ).toEqual([]);
      expect(socket.readyState).not.toBe(WebSocket.OPEN);
    } finally {
      vi.useRealTimers();
    }
  });
  connection.close();
});

it.each([
  ["start", "entry"],
  ["start", "alarm"],
  ["advance", "entry"],
  ["advance", "alarm"],
])("共有%sの%s待機で期限を越えた未確定操作を拒否する", async (action, pause) => {
  const { roomId } = await createRoomAs(owner);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).setPhase(
    buildPhaseStep(2),
    owner.sub,
  );
  const connection = await connectRoomAs(owner, roomId);
  await connection.next();
  await runInRoomDO(roomId, async (instance, state) => {
    const sharing = getSharingState(state.storage.sql);
    if (!sharing) throw new Error("sharing missing");
    if (action === "advance")
      saveSharingState(state.storage.sql, {
        ...sharing,
        status: "active",
        currentIndex: 0,
        startsAt: null,
      });
    const before = getSharingState(state.storage.sql);
    const timerBefore = state.storage.sql
      .exec("SELECT * FROM timer_state")
      .toArray();
    const socket = state.getWebSockets()[0];
    const expiry = Math.floor(Date.now() / 1000) + 60;
    socket.serializeAttachment({
      ...socket.deserializeAttachment(),
      sessionExpiresAt: expiry,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((expiry - 1) * 1000);
    const transaction = state.storage.transaction.bind(state.storage);
    const setAlarm = state.storage.setAlarm.bind(state.storage);
    const delayed =
      pause === "entry"
        ? vi
            .spyOn(state.storage, "transaction")
            .mockImplementation((callback) => {
              vi.setSystemTime(expiry * 1000);
              return transaction(callback);
            })
        : vi
            .spyOn(state.storage, "setAlarm")
            .mockImplementation(async (...args) => {
              await setAlarm(...args);
              vi.setSystemTime(expiry * 1000);
            });
    try {
      await instance.webSocketMessage(
        socket,
        JSON.stringify({
          type: action === "start" ? "sharing:start" : "sharing:advance",
          revision: sharing.revision,
          ...(action === "start" ? { durationMs: 60000 } : { outcome: "done" }),
        }),
      );
      expect(getSharingState(state.storage.sql)).toEqual(before);
      expect(
        state.storage.sql.exec("SELECT * FROM timer_state").toArray(),
      ).toEqual(timerBefore);
      expect(socket.readyState).not.toBe(WebSocket.OPEN);
    } finally {
      delayed.mockRestore();
      vi.useRealTimers();
    }
  });
  connection.close();
});
