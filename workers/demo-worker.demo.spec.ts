import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  NOTE_HEIGHT,
  NOTE_SPAWN_X_MIN,
  NOTE_SPAWN_Y_MIN,
  NOTE_WIDTH,
} from "../contracts/board";
import { DEMO_HOST, DemoStatusSchema } from "../contracts/demo";
import type { ClientMessage, ServerMessage } from "../contracts/room-protocol";
import { TOKEN_AUDIENCE } from "../contracts/session";
import { signToken } from "../lib/session/token";
import productionWorker from "./api-worker";
import demoWorker from "./demo-worker";
import { getCarryovers, getDecision } from "./room/decisions";
import { listNotes } from "./room/notes";
import { haveAllMembersCompletedVoting } from "./room/votes";
import { connectRoomAs, type RoomSocket } from "./test-helpers";

const TOKEN = "demo-test-control-token-at-least-32-characters";
async function headers(
  sub: string = DEMO_HOST.sub,
): Promise<Record<string, string>> {
  const token = await signToken(
    { ...DEMO_HOST, sub },
    {
      secret: env.SESSION_SECRET,
      audience: TOKEN_AUDIENCE.session,
      expiresInSeconds: 600,
    },
  );
  return {
    Cookie: `idea_boost_session=${token}`,
    "Content-Type": "application/json",
    "X-Demo-Control-Token": TOKEN,
  };
}
async function create(checkpoint = "start"): Promise<string> {
  const response = await SELF.fetch("http://localhost/api/demo/rooms", {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ checkpoint }),
  });
  expect(response.status).toBe(200);
  return (await response.json<{ roomId: string }>()).roomId;
}
async function status(id: string) {
  const response = await SELF.fetch(`http://localhost/api/demo/rooms/${id}`, {
    headers: await headers(),
  });
  expect(response.status).toBe(200);
  return DemoStatusSchema.parse(await response.json());
}
async function action(id: string, action: string, phase: number, step: number) {
  return SELF.fetch(`http://localhost/api/demo/rooms/${id}/actions`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ action, phase, step }),
  });
}
describe("ローカルデモの拒否境界", () => {
  it("本番の入口は正しいデモ用秘密があっても機能を持たない", async () => {
    const response = await productionWorker.fetch(
      new Request("http://localhost/api/demo/rooms", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ checkpoint: "start" }),
      }),
      env,
    );
    expect(response.status).toBe(404);
  });
  it("明示的起動フラグ・秘密・localhost・セッションを要求する", async () => {
    const request = () =>
      new Request("http://localhost/api/demo/rooms", { method: "POST" });
    expect(
      (
        await demoWorker.fetch(request(), {
          ...env,
          IDEA_BOOST_DEMO: "false",
          DEMO_CONTROL_TOKEN: TOKEN,
        })
      ).status,
    ).toBe(404);
    expect((await SELF.fetch(request())).status).toBe(404);
    expect(
      (
        await SELF.fetch("https://example.com/api/demo/rooms", {
          method: "POST",
          headers: await headers(),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await SELF.fetch("http://localhost/api/demo/rooms", {
          method: "POST",
          headers: { "X-Demo-Control-Token": TOKEN },
        })
      ).status,
    ).toBe(401);
  });
  it("別ユーザーや通常作成ルームには使えない", async () => {
    const response = await SELF.fetch("http://localhost/api/demo/rooms", {
      method: "POST",
      headers: await headers("d0000000-0000-4000-8000-000000000009"),
      body: JSON.stringify({ checkpoint: "start" }),
    });
    expect(response.status).toBe(403);
    const normal = await SELF.fetch("http://localhost/api/rooms", {
      method: "POST",
      headers: await headers(),
    });
    const { roomId } = await normal.json<{ roomId: string }>();
    expect((await action(roomId, "share", 1, 2)).status).toBe(404);
  });
});
describe("デモの5場面と合図", () => {
  it.each([
    ["start", 1, 1, 0],
    ["share", 1, 2, 0],
    ["vote", 1, 4, 4],
    ["ideas", 3, 3, 4],
    ["complete", 3, 5, 4],
  ] as const)("%s の状態と5人を構築する", async (checkpoint, phase, step, shared) => {
    const id = await create(checkpoint);
    expect(await status(id)).toMatchObject({
      checkpoint,
      phase: { kind: "step", phase, step },
      sharedCount: shared,
    });
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(id));
    expect(await stub.listMembers()).toHaveLength(5);
    await runInDurableObject(stub, (_instance, state) => {
      const notes = listNotes(state.storage.sql, DEMO_HOST.sub, phase);
      expect(notes).toHaveLength(5);
      if (phase === 3)
        expect(getCarryovers(state.storage.sql, 3)).toHaveLength(2);
      if (checkpoint === "complete") {
        expect(getDecision(state.storage.sql, 3)).not.toBeNull();
        expect(haveAllMembersCompletedVoting(state.storage.sql, 3)).toBe(true);
      }
    });
  });
  it("再開は新しいルームで、合図は冪等・古い場面の操作は拒否", async () => {
    const id = await create("share");
    expect((await action(id, "vote", 1, 2)).status).toBe(409);
    expect((await action(id, "share", 2, 2)).status).toBe(409);
    expect((await action(id, "share", 1, 2)).status).toBe(200);
    expect((await action(id, "share", 1, 2)).status).toBe(200);
    expect((await status(id)).sharedCount).toBe(4);
    const reset = await create("share");
    expect(reset).not.toBe(id);
    expect((await status(reset)).sharedCount).toBe(0);
    expect((await status(id)).sharedCount).toBe(4);
  });
  it("他4人の票は合図で揃い、ホストの投票は代行しない", async () => {
    const id = await create("vote");
    expect((await status(id)).votedCount).toBe(0);
    expect((await action(id, "vote", 1, 4)).status).toBe(200);
    expect((await action(id, "vote", 1, 4)).status).toBe(200);
    expect((await status(id)).votedCount).toBe(4);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(id));
    await runInDurableObject(stub, (_instance, state) => {
      expect(haveAllMembersCompletedVoting(state.storage.sql, 1)).toBe(false);
      expect(
        state.storage.sql
          .exec(
            "SELECT COUNT(DISTINCT note_id) AS count FROM note_vote_stickers",
          )
          .one().count,
      ).toBeGreaterThan(1);
    });
  });
});

async function until(
  socket: RoomSocket,
  matches: (message: ServerMessage) => boolean,
): Promise<ServerMessage> {
  for (let count = 0; count < 150; count++) {
    const message = await socket.next();
    if (message.type === "error") throw new Error(message.message);
    if (matches(message)) return message;
  }
  throw new Error("目的のWSメッセージを受信できませんでした。");
}
async function send(
  socket: RoomSocket,
  message: ClientMessage,
  matches: (message: ServerMessage) => boolean,
): Promise<ServerMessage> {
  socket.ws.send(JSON.stringify(message));
  return until(socket, matches);
}
it("実WebSocketで個人付箋と他人の票を隠し、自由な課題選択で最後まで進める", async () => {
  const id = await create("start");
  const socket = await connectRoomAs(DEMO_HOST, id);
  try {
    const initial = await socket.next();
    expect(initial.type).toBe("snapshot");
    if (initial.type !== "snapshot") throw new Error("snapshot missing");
    expect(initial.notes).toHaveLength(1);
    expect(initial.notes.every((note) => note.authorId === DEMO_HOST.sub)).toBe(
      true,
    );
    for (const phase of [1, 2, 3]) {
      const created = await send(
        socket,
        { type: "note:create", content: `自由に選んだ案 ${phase}` },
        (message) => message.type === "note:inserted",
      );
      if (created.type !== "note:inserted") throw new Error("note missing");
      const hostNoteId = created.note.id;
      await send(
        socket,
        { type: "phase:next" },
        (message) => message.type === "phase:updated",
      );
      await send(
        socket,
        { type: "note:publish", noteId: hostNoteId, x: 20, y: 30 },
        (message) =>
          message.type === "note:inserted" && message.note.id === hostNoteId,
      );
      expect((await action(id, "share", phase, 2)).status).toBe(200);
      await until(
        socket,
        (message) =>
          message.type === "note:inserted" &&
          message.note.authorId === "d0000000-0000-4000-8000-000000000005",
      );
      const votingStep = phase === 2 ? 3 : 4;
      for (let step = 2; step < votingStep; step++)
        await send(
          socket,
          { type: "phase:next" },
          (message) => message.type === "phase:updated",
        );
      expect((await action(id, "vote", phase, votingStep)).status).toBe(200);
      // 新しい接続の投票snapshotには他4人の票も総数も現れない。
      const observer = await connectRoomAs(DEMO_HOST, id);
      const voting = await observer.next();
      expect(voting.type).toBe("snapshot");
      if (voting.type !== "snapshot") throw new Error("snapshot missing");
      expect(
        voting.notes.every(
          (note) =>
            note.dotVoteStickers.length === 0 &&
            note.dotVotes.objective.count === undefined,
        ),
      ).toBe(true);
      observer.close();
      for (const kind of ["subjective", "objective"] as const)
        for (let count = 0; count < (kind === "subjective" ? 1 : 3); count++)
          await send(
            socket,
            { type: "note:vote", noteId: hostNoteId, kind },
            (message) =>
              message.type === "note:updated" &&
              message.note.id === hostNoteId &&
              message.note.dotVotes[kind].ownCount === count + 1,
          );
      await send(
        socket,
        { type: "phase:next" },
        (message) => message.type === "phase:updated",
      );
      await send(
        socket,
        { type: "note:decide", noteId: hostNoteId },
        (message) =>
          message.type === "decision:updated" && message.noteId === hostNoteId,
      );
      if (phase < 3)
        await send(
          socket,
          { type: "phase:next" },
          (message) => message.type === "phase:updated",
        );
    }
    const reconnected = await connectRoomAs(DEMO_HOST, id);
    const completed = await reconnected.next();
    expect(completed.type).toBe("snapshot");
    if (completed.type !== "snapshot") throw new Error("snapshot missing");
    expect(completed.phase).toEqual({ kind: "step", phase: 3, step: 5 });
    expect(completed.decision).not.toBeNull();
    expect(completed.carryovers.map((item) => item.content)).toEqual([
      "自由に選んだ案 1",
      "自由に選んだ案 2",
    ]);
    expect(
      completed.notes.reduce(
        (sum, note) => sum + (note.dotVotes.objective.count ?? 0),
        0,
      ),
    ).toBe(15);
    reconnected.close();
  } finally {
    socket.close();
  }
}, 10000);

it("共有付箋は1280×500の初期ボード表示に収まる", async () => {
  for (const checkpoint of ["vote", "share"]) {
    const id = await create(checkpoint);
    if (checkpoint === "share")
      expect((await action(id, "share", 1, 2)).status).toBe(200);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(id));
    await runInDurableObject(stub, (_instance, state) => {
      const notes = listNotes(state.storage.sql, DEMO_HOST.sub, 1).filter(
        (note) => note.visibility === "shared",
      );
      for (const note of notes) {
        const screenX = note.x - (NOTE_SPAWN_X_MIN + NOTE_WIDTH / 2) + 640;
        const screenY = note.y - (NOTE_SPAWN_Y_MIN + NOTE_HEIGHT / 2) + 250;
        expect(screenX).toBeGreaterThanOrEqual(40);
        expect(screenX + NOTE_WIDTH).toBeLessThanOrEqual(1240);
        expect(screenY).toBeGreaterThanOrEqual(40);
        expect(screenY + NOTE_HEIGHT).toBeLessThanOrEqual(460);
      }
    });
  }
});

it("アイデア比較では推奨案をガイドと重ならない右上に置く", async () => {
  const id = await create("ideas");
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(id));
  await runInDurableObject(stub, (_instance, state) => {
    const recommended = listNotes(state.storage.sql, DEMO_HOST.sub, 3).find(
      (note) => note.authorId === DEMO_HOST.sub,
    );
    expect(recommended?.x).toBeGreaterThanOrEqual(60);
    expect(recommended?.y).toBeGreaterThanOrEqual(70);
  });
});
