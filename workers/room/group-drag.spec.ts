import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateRenderGroups } from "../../contracts/grouping";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import type { ClientMessage } from "../../contracts/room-protocol";
import { buildGroup, buildNote } from "../../contracts/room-protocol.fixture";
import { currentPhaseExpectation, runInRoomDO } from "../test-helpers";
import { RoomBroadcaster, type SocketAttachment } from "./broadcast";
import { groupDragHandlers } from "./group-drag";
import { HOST_ID_HEADER, USER_ID_HEADER } from "./room-do";

const hostId = "11111111-1111-4111-8111-111111111111";
const guestId = "22222222-2222-4222-8222-222222222222";
const noteA = buildNote({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  authorId: hostId,
  x: 100,
  y: 100,
  content: "A",
});
const noteB = buildNote({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  authorId: guestId,
  x: 360,
  y: 120,
  content: "B",
});
const outside = buildNote({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  authorId: guestId,
  x: 1000,
  y: 1000,
});
const privateNote = buildNote({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  authorId: guestId,
  x: 100,
  y: 100,
  visibility: "private",
});
const dragId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const frame = calculateRenderGroups([noteA, noteB], [])[0];
const start = {
  type: "group:drag:start",
  dragId,
  anchorNoteId: noteA.id,
  bounds: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
  positions: [noteA, noteB].map(({ id, x, y }) => ({ noteId: id, x, y })),
} satisfies ClientMessage;
type Message = Record<string, unknown>;
const sockets: WebSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

/** 参加者としてRoomDOへ接続し、サーバーの受信通知を到着順に読み出せるようにする。 */
async function connect(roomName: string, userId: string) {
  const response = await env.ROOM_DO.get(
    env.ROOM_DO.idFromName(roomName),
  ).fetch("https://do/ws", {
    headers: {
      Upgrade: "websocket",
      [USER_ID_HEADER]: userId,
      [HOST_ID_HEADER]: hostId,
    },
  });
  expect(response.status).toBe(101);
  const ws = response.webSocket;
  if (!ws) throw new Error("socket missing");
  const messages: Message[] = [];
  const waiting: Array<(message: Message) => void> = [];
  ws.accept();
  sockets.push(ws);
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as Message;
    const resolve = waiting.shift();
    if (resolve) resolve(message);
    else messages.push(message);
  });
  /** 届いた通知を取り出し、未到着なら次のWebSocket通知まで待つ。 */
  const next = async (): Promise<Message> =>
    messages.shift() ?? new Promise((resolve) => waiting.push(resolve));
  /** 目的の通知またはエラーまで受信を進め、操作の受理と確定を検証する。 */
  const until = async (type: string): Promise<Message> => {
    for (let index = 0; index < 20; index++) {
      const message = await next();
      if (message.type === type || message.type === "error") return message;
    }
    throw new Error(`${type} missing`);
  };
  const snapshot = await until("snapshot");
  return {
    ws,
    snapshot,
    until,
    messages,
    send: (message: ClientMessage) => ws.send(JSON.stringify(message)),
  };
}

/** 共有・個人・領域外の付箋を用意し、ホストと参加者の接続を作る。 */
async function setup(roomName: string, step = 3) {
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomName));
  await stub.initializeNewRoom(hostId, "Host");
  await stub.upsertMember(guestId, "Guest");
  await stub.setPhase(buildPhaseStep(step), hostId);
  await runInRoomDO(roomName, (_room, state) => {
    const now = new Date().toISOString();
    for (const note of [noteA, noteB, outside, privateNote])
      state.storage.sql.exec(
        "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
        note.id,
        note.authorId,
        note.content,
        note.visibility,
        note.color,
        note.x,
        note.y,
        now,
      );
  });
  return {
    host: await connect(roomName, hostId),
    guest: await connect(roomName, guestId),
  };
}

/** RoomDOの保存座標を読み、配信だけでなく移動の永続化を検証する。 */
function positions(roomName: string) {
  return runInRoomDO(roomName, (_room, state) =>
    state.storage.sql.exec("SELECT id, x, y FROM notes ORDER BY id").toArray(),
  );
}

describe("グループ一括ドラッグ", () => {
  it("接続を維持しても開始から60秒で終了するalarmを予約する", async () => {
    const roomName = "group-drag-expiry-alarm";
    const { host } = await setup(roomName);
    const before = Date.now();
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    const deadline = await runInRoomDO(roomName, (_room, state) =>
      state.storage.getAlarm(),
    );
    expect(deadline).toBeGreaterThanOrEqual(before + 60_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it("期限を迎えた移動は最後の位置で終了し、ロックと再編成の抑止を解除する", async () => {
    const roomName = "group-drag-expiry-recovery";
    const { host, guest } = await setup(roomName);
    const groupId = "99999999-9999-4999-8999-999999999999";
    host.send({
      type: "group:create",
      group: buildGroup({ id: groupId, noteIds: [noteA.id, noteB.id] }),
    });
    await guest.until("group:updated");
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    await guest.until("group:drag:updated");
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: 600, y: 900 },
    });
    await guest.until("group:drag:updated");
    await runInRoomDO(roomName, async (room, state) => {
      state.storage.sql.exec(
        "UPDATE active_group_drags SET state_json = json_set(state_json, '$.expiresAt', ?1)",
        Date.now() - 1,
      );
      await room.alarm();
    });
    expect(
      await runInRoomDO(roomName, (_room, state) =>
        state.storage.sql
          .exec("SELECT drag_id FROM active_group_drags")
          .toArray(),
      ),
    ).toEqual([]);
    expect(await guest.until("group:drag:updated")).toMatchObject({
      dragId,
      ended: true,
      notes: [
        expect.objectContaining({ id: noteA.id, x: 700, y: 1000 }),
        expect.objectContaining({ id: noteB.id, x: 960, y: 1020 }),
      ],
    });
    const reconnected = await connect(roomName, guestId);
    expect(reconnected.snapshot.groups).toEqual([
      expect.objectContaining({
        id: groupId,
        noteIds: [noteA.id, noteB.id, outside.id],
      }),
    ]);
    const nextDragId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    guest.send({
      type: "note:drag:start",
      noteId: noteB.id,
      dragId: nextDragId,
    });
    expect(await guest.until("note:drag:result")).toMatchObject({
      accepted: true,
    });
    host.send({
      type: "group:drag:end",
      dragId,
      sequence: 2,
      delta: { x: -600, y: -900 },
    });
    guest.send({
      type: "note:drag:end",
      noteId: noteB.id,
      dragId: nextDragId,
      position: { x: 970, y: 1020 },
    });
    await guest.until("note:updated");
    await vi.waitFor(async () =>
      expect(await positions(roomName)).toContainEqual({
        id: noteB.id,
        x: 970,
        y: 1020,
      }),
    );
  });

  it("alarm前でも期限後の移動量を適用せず、最後の位置で操作を終了する", async () => {
    const roomName = "group-drag-expired-message";
    const { host, guest } = await setup(roomName);
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    await guest.until("group:drag:updated");
    await runInRoomDO(roomName, (_room, state) =>
      state.storage.sql.exec(
        "UPDATE active_group_drags SET state_json = json_set(state_json, '$.expiresAt', ?1)",
        Date.now() - 1,
      ),
    );
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: 80, y: 40 },
    });
    expect(await guest.until("group:drag:updated")).toMatchObject({
      ended: true,
      notes: [
        expect.objectContaining({ id: noteA.id, x: 100, y: 100 }),
        expect.objectContaining({ id: noteB.id, x: 360, y: 120 }),
      ],
    });
  });

  it("別のalarmで期限前の移動を終了せず、途中更新で期限を延ばさない", async () => {
    const roomName = "group-drag-live-deadline";
    const { host, guest } = await setup(roomName);
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    await guest.until("group:drag:updated");
    const deadline = await runInRoomDO(roomName, (_room, state) =>
      state.storage.getAlarm(),
    );
    expect(deadline).not.toBeNull();
    await runInRoomDO(roomName, (room) => room.alarm());
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: 80, y: 40 },
    });
    expect(await guest.until("group:drag:updated")).toMatchObject({
      ended: false,
    });
    expect(
      await runInRoomDO(roomName, (_room, state) => state.storage.getAlarm()),
    ).toBe(deadline);
  });

  it("グルーピング工程外の切断では残った枠の所属を再編成しない", async () => {
    const roomName = "group-drag-disconnect-outside-grouping";
    const { host, guest } = await setup(roomName);
    const groupId = "99999999-9999-4999-8999-999999999999";
    host.send({
      type: "group:create",
      group: buildGroup({ id: groupId, noteIds: [noteA.id, noteB.id] }),
    });
    await guest.until("group:updated");
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    await guest.until("group:drag:updated");
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: 600, y: 900 },
    });
    await guest.until("group:drag:updated");
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(roomName)).setPhase(
      buildPhaseStep(4),
      hostId,
    );
    host.ws.close();
    expect(await guest.until("group:drag:updated")).toMatchObject({
      ended: true,
    });
    const reconnected = await connect(roomName, guestId);
    expect(reconnected.snapshot.groups).toEqual([
      expect.objectContaining({ id: groupId, noteIds: [noteA.id, noteB.id] }),
    ]);
  });

  it("別の参加者が操作IDを流用して他のグループの開始状態を上書きできない", async () => {
    const roomName = "group-drag-id-collision";
    const { host, guest } = await setup(roomName);
    const otherNotes = [
      buildNote({
        id: "55555555-5555-4555-8555-555555555555",
        authorId: guestId,
        x: 100,
        y: 3000,
      }),
      buildNote({
        id: "66666666-6666-4666-8666-666666666666",
        authorId: guestId,
        x: 360,
        y: 3000,
      }),
    ];
    await runInRoomDO(roomName, (_room, state) => {
      for (const note of otherNotes)
        state.storage.sql.exec(
          "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, '', 'shared', 'yellow', ?3, ?4, 1, '', '')",
          note.id,
          guestId,
          note.x,
          note.y,
        );
    });
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    const otherFrame = calculateRenderGroups(otherNotes, [])[0];
    guest.send({
      ...start,
      anchorNoteId: otherNotes[0].id,
      bounds: {
        x: otherFrame.x,
        y: otherFrame.y,
        width: otherFrame.width,
        height: otherFrame.height,
      },
      positions: otherNotes.map(({ id, x, y }) => ({ noteId: id, x, y })),
    });
    expect(await guest.until("group:drag:result")).toMatchObject({
      accepted: false,
    });
    host.send({
      type: "group:drag:end",
      dragId,
      sequence: 1,
      delta: { x: 80, y: 40 },
    });
    const end = await host.until("group:drag:updated");
    if (!end.ended) await host.until("group:drag:updated");
    expect(await positions(roomName)).toContainEqual({
      id: noteA.id,
      x: 180,
      y: 140,
    });
  });
  it("別グループ移動中の300枚の開始判定で移動状態を対象ごとに再読込しない", async () => {
    const roomName = "group-drag-batched-start-locks";
    const { host, guest } = await setup(roomName);
    host.send(start);
    await host.until("group:drag:result");
    guest.send({
      type: "note:drag:start",
      noteId: outside.id,
      dragId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    expect(await guest.until("note:drag:result")).toMatchObject({
      accepted: true,
    });
    const requester = await connect(roomName, hostId);
    const targets = Array.from({ length: 300 }, (_, index) =>
      buildNote({
        id: `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
        content: "",
        x: 3000 + (index % 10) * 260,
        y: 3000 + Math.floor(index / 10) * 180,
      }),
    );
    await runInRoomDO(roomName, (_room, state) => {
      for (const note of targets)
        state.storage.sql.exec(
          "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, '', 'shared', 'yellow', ?3, ?4, 1, '', '')",
          note.id,
          hostId,
          note.x,
          note.y,
        );
    });
    const targetFrame = calculateRenderGroups(targets, [])[0];
    const observed = await runInRoomDO(roomName, async (_room, state) => {
      let stateReads = 0;
      const sql = new Proxy(state.storage.sql, {
        get(target, key) {
          if (key === "exec")
            return (...args: Parameters<SqlStorage["exec"]>) => {
              if (args[0].includes("SELECT state_json FROM active_group_drags"))
                stateReads++;
              return target.exec(...args);
            };
          return Reflect.get(target, key, target);
        },
      });
      const ws = state.getWebSockets().find((socket) => {
        const attachment = socket.deserializeAttachment() as SocketAttachment;
        return attachment.userId === hostId && !attachment.activeDrag;
      });
      if (!ws) throw new Error("requester missing");
      const replies: unknown[] = [];
      await groupDragHandlers["group:drag:start"](
        {
          sql,
          storage: state.storage,
          ws,
          userId: hostId,
          broadcaster: new RoomBroadcaster(state, sql),
          reply: (message) => {
            replies.push(message);
          },
          refreshSnapshots: () => {},
        },
        {
          type: "group:drag:start",
          dragId: "eeeeeeee-1111-4111-8111-eeeeeeeeeeee",
          anchorNoteId: targets[0].id,
          bounds: {
            x: targetFrame.x,
            y: targetFrame.y,
            width: targetFrame.width,
            height: targetFrame.height,
          },
          positions: targets.map(({ id, x, y }) => ({ noteId: id, x, y })),
        },
      );
      return { stateReads, replies };
    });
    expect(observed.replies).toContainEqual(
      expect.objectContaining({ accepted: true }),
    );
    expect(observed.stateReads).toBeLessThanOrEqual(5);
    expect(await requester.until("group:drag:updated")).toMatchObject({
      ended: false,
    });
  });

  it("300枚のまとまりも接続の付帯情報のサイズに依存せず一括移動できる", async () => {
    const roomName = "group-drag-large";
    const { host } = await setup(roomName);
    const notes = Array.from({ length: 300 }, (_, index) =>
      buildNote({
        id: `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
        authorId: hostId,
        x: index * 220,
        y: 100,
        content: "大きなまとまり",
      }),
    );
    await runInRoomDO(roomName, (_room, state) => {
      state.storage.sql.exec("DELETE FROM notes");
      for (const note of notes)
        state.storage.sql.exec(
          "INSERT INTO notes (id, author_id, content, visibility, color, x, y, phase, created_at, updated_at) VALUES (?1, ?2, ?3, 'shared', 'yellow', ?4, ?5, 1, '', '')",
          note.id,
          hostId,
          note.content,
          note.x,
          note.y,
        );
    });
    const largeFrame = calculateRenderGroups(notes, [])[0];
    host.send({
      ...start,
      anchorNoteId: notes[0].id,
      bounds: {
        x: largeFrame.x,
        y: largeFrame.y,
        width: largeFrame.width,
        height: largeFrame.height,
      },
      positions: notes.map(({ id, x, y }) => ({ noteId: id, x, y })),
    });
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    const update = await host.until("group:drag:updated");
    expect(update).toMatchObject({ type: "group:drag:updated", ended: false });
    expect(update.notes).toHaveLength(300);
    await connect(roomName, hostId);
    await connect(roomName, guestId);
    const sqlCalls = await runInRoomDO(roomName, async (_room, state) => {
      let calls = 0;
      const sql = new Proxy(state.storage.sql, {
        get(target, key) {
          if (key === "exec")
            return (...args: Parameters<SqlStorage["exec"]>) => {
              calls++;
              return target.exec(...args);
            };
          return Reflect.get(target, key, target);
        },
      });
      const ws = state
        .getWebSockets()
        .find(
          (socket) =>
            (socket.deserializeAttachment() as SocketAttachment).activeDrag
              ?.dragId === dragId,
        );
      if (!ws) throw new Error("active socket missing");
      await groupDragHandlers["group:drag:move"](
        {
          sql,
          storage: state.storage,
          ws,
          userId: hostId,
          broadcaster: new RoomBroadcaster(state, sql),
          reply: () => {},
          refreshSnapshots: () => {},
        },
        {
          type: "group:drag:move",
          dragId,
          sequence: 1,
          delta: { x: 40, y: 20 },
        },
      );
      return calls;
    });
    expect(sqlCalls).toBe(4);
    const movement = await host.until("group:drag:updated");
    expect(movement.notes).toHaveLength(300);
    expect((movement.notes as Record<string, unknown>[])[0]).toEqual({
      id: notes[0].id,
      x: notes[0].x + 40,
      y: notes[0].y + 20,
      updatedAt: expect.any(String),
    });
    expect(JSON.stringify(movement).length).toBeLessThan(60_000);
    expect(JSON.stringify(movement).length).toBeLessThan(
      JSON.stringify(update).length / 2,
    );
    expect(await positions(roomName)).toEqual(
      notes.map((note) => ({ id: note.id, x: note.x + 40, y: note.y + 20 })),
    );
    host.send({ type: "group:drag:end", dragId, sequence: 2, delta: null });
    const final = await host.until("group:drag:updated");
    expect(final.ended).toBe(true);
    expect((final.notes as Record<string, unknown>[])[0]).toMatchObject({
      id: notes[0].id,
      content: notes[0].content,
      x: notes[0].x + 40,
      y: notes[0].y + 20,
    });
  });
  it.each(["private", "deleted", "phase"])(
    "開始後に対象が%sへ変わったら移動せず内容なしで終了を配信する",
    async (change) => {
      const roomName = `group-drag-changed-target-${change}`;
      const { host, guest } = await setup(roomName);
      host.send(start);
      await host.until("group:drag:result");
      await host.until("group:drag:updated");
      await guest.until("group:drag:updated");
      await runInRoomDO(roomName, (_room, state) => {
        if (change === "deleted")
          state.storage.sql.exec("DELETE FROM notes WHERE id = ?1", noteA.id);
        else if (change === "private")
          state.storage.sql.exec(
            "UPDATE notes SET visibility = 'private' WHERE id = ?1",
            noteA.id,
          );
        else
          state.storage.sql.exec(
            "UPDATE notes SET phase = 2 WHERE id = ?1",
            noteA.id,
          );
      });
      const operatorMessages: Message[] = [];
      host.ws.addEventListener("message", (event) => {
        operatorMessages.push(JSON.parse(String(event.data)) as Message);
      });
      host.send({
        type: "group:drag:move",
        dragId,
        sequence: 1,
        delta: { x: 80, y: 40 },
      });
      host.send({
        type: "note:drag:start",
        noteId: noteB.id,
        dragId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      });
      expect(await host.until("note:drag:result")).toMatchObject({
        accepted: true,
      });
      expect(await positions(roomName)).toContainEqual({
        id: noteB.id,
        x: noteB.x,
        y: noteB.y,
      });
      const ended = { type: "group:drag:result", dragId, accepted: false };
      expect(
        operatorMessages.filter(
          (message) => message.type === "group:drag:result",
        ),
      ).toEqual([ended]);
      expect(
        guest.messages.filter(
          (message) => message.type === "group:drag:result",
        ),
      ).toEqual([ended]);
      expect(
        guest.messages.some((message) => message.type === "group:drag:updated"),
      ).toBe(false);
    },
  );

  it("非メンバーの一括移動を拒否する", async () => {
    const roomName = "group-drag-non-member";
    const { guest } = await setup(roomName);
    await runInRoomDO(roomName, (_room, state) =>
      state.storage.sql.exec("DELETE FROM members WHERE user_id = ?1", guestId),
    );
    guest.send(start);
    expect(await guest.until("error")).toMatchObject({
      type: "error",
      code: "forbidden",
    });
  });

  it("未共有付箋を混ぜた開始要求を拒否し、位置も取得可否も他者へ配信しない", async () => {
    const roomName = "group-drag-private";
    const { host, guest } = await setup(roomName);
    host.send({
      ...start,
      positions: [
        ...start.positions,
        { noteId: privateNote.id, x: 100, y: 100 },
      ],
    });
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: false,
    });
    expect(
      guest.messages.some((message) => message.type === "group:drag:updated"),
    ).toBe(false);
    expect(await positions(roomName)).toContainEqual({
      id: privateNote.id,
      x: 100,
      y: 100,
    });
  });

  it("投票工程では一括移動を拒否する", async () => {
    const { host } = await setup("group-drag-voting", 4);
    host.send(start);
    expect(await host.until("error")).toMatchObject({
      type: "error",
      code: "forbidden",
    });
  });

  it("参加者が全付箋を同じ差分で移動し、一括配信・保存して領域外とprivateを動かさない", async () => {
    const roomName = "group-drag-translation";
    const { host, guest } = await setup(roomName);
    guest.send(start);
    expect(await guest.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    await host.until("group:drag:updated");
    guest.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: 80, y: 40 },
    });
    const update = await host.until("group:drag:updated");
    expect(update).toMatchObject({
      ended: false,
      sequence: 1,
      notes: [
        expect.objectContaining({ id: noteA.id, x: 180, y: 140 }),
        expect.objectContaining({ id: noteB.id, x: 440, y: 160 }),
      ],
    });
    guest.send({
      type: "group:drag:end",
      dragId,
      sequence: 2,
      delta: { x: 100, y: 50 },
    });
    expect(await host.until("group:drag:updated")).toMatchObject({
      ended: true,
    });
    expect(await positions(roomName)).toEqual([
      { id: noteA.id, x: 200, y: 150 },
      { id: noteB.id, x: 460, y: 170 },
      { id: outside.id, x: 1000, y: 1000 },
      { id: privateNote.id, x: 100, y: 100 },
    ]);
    const reconnected = await connect(roomName, hostId);
    expect(reconnected.snapshot.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: noteA.id, x: 200, y: 150 }),
        expect.objectContaining({ id: noteB.id, x: 460, y: 170 }),
      ]),
    );
  });

  it("対象の一枚が操作中なら全件を拒否し、ロックを部分取得しない", async () => {
    const roomName = "group-drag-conflict";
    const { host, guest } = await setup(roomName);
    guest.send({ type: "note:drag:start", noteId: noteB.id, dragId });
    expect(await guest.until("note:drag:result")).toMatchObject({
      accepted: true,
    });
    host.send({ ...start, dragId: "ffffffff-ffff-4fff-8fff-ffffffffffff" });
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: false,
    });
    host.send({
      type: "note:drag:start",
      noteId: noteA.id,
      dragId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
    });
    expect(await host.until("note:drag:result")).toMatchObject({
      accepted: true,
    });
  });

  it("再接続した閲覧者にも移動中の枠と対象を復元する", async () => {
    const roomName = "group-drag-snapshot";
    const { host } = await setup(roomName);
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    const other = await connect(roomName, guestId);
    expect(other.snapshot.groupDrags).toEqual([
      expect.objectContaining({ dragId, noteIds: [noteA.id, noteB.id] }),
    ]);
  });

  it("一括移動中の単独操作と重複した一括移動を拒否する", async () => {
    const roomName = "group-drag-lock-all";
    const { host, guest } = await setup(roomName);
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    guest.send({
      type: "note:drag:start",
      noteId: noteB.id,
      dragId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    expect(await guest.until("note:drag:result")).toMatchObject({
      accepted: false,
    });
    guest.send({ ...start, dragId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01" });
    expect(await guest.until("group:drag:result")).toMatchObject({
      accepted: false,
    });
    host.send({
      type: "note:drag:move",
      noteId: noteA.id,
      dragId,
      x: 900,
      y: 900,
    });
    host.send({ type: "group:drag:end", dragId, sequence: 1, delta: null });
    const ended = await guest.until("group:drag:updated");
    expect(ended).toMatchObject({ ended: true });
    expect(await positions(roomName)).toContainEqual({
      id: noteA.id,
      x: 100,
      y: 100,
    });
  });

  it("古い途中更新を無視し、終了した操作IDを再接続で使い直せない", async () => {
    const roomName = "group-drag-sequence";
    const { host } = await setup(roomName);
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    await host.until("group:drag:updated");
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 2,
      delta: { x: 80, y: 40 },
    });
    await host.until("group:drag:updated");
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: -80, y: -40 },
    });
    host.send({ type: "group:drag:end", dragId, sequence: 3, delta: null });
    expect(await host.until("group:drag:updated")).toMatchObject({
      ended: true,
    });
    expect(await positions(roomName)).toContainEqual({
      id: noteB.id,
      x: 440,
      y: 160,
    });
    const reconnected = await connect(roomName, hostId);
    reconnected.send(start);
    expect(await reconnected.until("group:drag:result")).toMatchObject({
      accepted: false,
    });
  });

  it("途中の保存失敗は全件をロールバックして操作権を解放する", async () => {
    const roomName = "group-drag-atomic-failure";
    const { host, guest } = await setup(roomName);
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    await guest.until("group:drag:updated");
    await runInRoomDO(roomName, (_room, state) =>
      state.storage.sql.exec(
        `CREATE TRIGGER reject_group_position BEFORE UPDATE OF x ON notes WHEN NEW.id = '${noteB.id}' BEGIN SELECT RAISE(ABORT, 'failure'); END`,
      ),
    );
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: 80, y: 40 },
    });
    expect(await guest.until("group:drag:updated")).toMatchObject({
      ended: true,
      notes: [
        expect.objectContaining({ x: 100, y: 100 }),
        expect.objectContaining({ x: 360, y: 120 }),
      ],
    });
    expect(await positions(roomName)).toContainEqual({
      id: noteA.id,
      x: 100,
      y: 100,
    });
    expect(
      await runInRoomDO(roomName, (_room, state) =>
        state.storage.sql.exec("SELECT * FROM active_group_drags").toArray(),
      ),
    ).toEqual([]);
  });

  it("開始状態の保存に失敗しても操作権を残さない", async () => {
    const roomName = "group-drag-start-failure";
    const { host, guest } = await setup(roomName);
    await runInRoomDO(roomName, (_room, state) =>
      state.storage.sql.exec(
        "CREATE TRIGGER reject_group_start BEFORE INSERT ON active_group_drags BEGIN SELECT RAISE(ABORT, 'failure'); END",
      ),
    );
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: false,
    });
    guest.send({
      type: "note:drag:start",
      noteId: noteB.id,
      dragId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    expect(await guest.until("note:drag:result")).toMatchObject({
      accepted: true,
    });
  });

  it("切断時は最後に受理した一括位置を保ち、別接続が対象を掴み直せる", async () => {
    const roomName = "group-drag-disconnect";
    const { host, guest } = await setup(roomName);
    host.send(start);
    expect(await host.until("group:drag:result")).toMatchObject({
      accepted: true,
    });
    await guest.until("group:drag:updated");
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: 80, y: 40 },
    });
    await guest.until("group:drag:updated");
    host.ws.close();
    expect(await guest.until("group:drag:updated")).toMatchObject({
      ended: true,
    });
    guest.send({
      type: "note:drag:start",
      noteId: noteB.id,
      dragId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    expect(await guest.until("note:drag:result")).toMatchObject({
      accepted: true,
    });
    expect(await positions(roomName)).toContainEqual({
      id: noteB.id,
      x: 440,
      y: 160,
    });
  });

  it.each(["disconnect", "phase"])(
    "移動中は所属を固定し、%sで最後の位置へ再編成する",
    async (reason) => {
      const roomName = `group-drag-${reason}-regroup`;
      const { host, guest } = await setup(roomName);
      const groupId = "99999999-9999-4999-8999-999999999999";
      host.send({
        type: "group:create",
        group: buildGroup({
          id: groupId,
          name: "課題",
          noteIds: [noteA.id, noteB.id],
        }),
      });
      await guest.until("group:updated");
      host.send(start);
      expect(await host.until("group:drag:result")).toMatchObject({
        accepted: true,
      });
      await guest.until("group:drag:updated");
      host.send({
        type: "group:drag:move",
        dragId,
        sequence: 1,
        delta: { x: 600, y: 900 },
      });
      await guest.until("group:drag:updated");
      const midDrag = await connect(roomName, guestId);
      expect(midDrag.snapshot.groups).toEqual([
        expect.objectContaining({ noteIds: [noteA.id, noteB.id] }),
      ]);
      if (reason === "disconnect") {
        host.ws.close();
        await guest.until("group:drag:updated");
      } else {
        host.send({
          type: "phase:next",
          ...(await currentPhaseExpectation(roomName)),
        });
        await guest.until("phase:updated");
      }
      const reconnected = await connect(roomName, guestId);
      expect(reconnected.snapshot.groups).toEqual([
        expect.objectContaining({
          id: groupId,
          noteIds: [noteA.id, noteB.id, outside.id],
        }),
      ]);
    },
  );
});
