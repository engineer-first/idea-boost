import { env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { calculateRenderGroups } from "../../contracts/grouping";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import { buildGroup, buildNote } from "../../contracts/room-protocol.fixture";
import { currentPhaseExpectation, runInRoomDO } from "../test-helpers";
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
};
type Message = Record<string, unknown>;
const sockets: WebSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

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
  const next = async (): Promise<Message> =>
    messages.shift() ?? new Promise((resolve) => waiting.push(resolve));
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
    send: (message: unknown) => ws.send(JSON.stringify(message)),
  };
}

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

function positions(roomName: string) {
  return runInRoomDO(roomName, (_room, state) =>
    state.storage.sql.exec("SELECT id, x, y FROM notes ORDER BY id").toArray(),
  );
}

describe("グループ一括ドラッグ", () => {
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
    host.send({
      type: "group:drag:move",
      dragId,
      sequence: 1,
      delta: { x: 40, y: 20 },
    });
    expect((await host.until("group:drag:updated")).notes).toHaveLength(300);
  });
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

  it.each([
    "disconnect",
    "phase",
  ])("移動中は所属を固定し、%sで最後の位置へ再編成する", async (reason) => {
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
  });
});
