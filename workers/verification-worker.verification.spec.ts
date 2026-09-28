import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { isResultStep } from "../contracts/phase";
import {
  VERIFICATION_CHECKPOINTS,
  VerificationActiveSchema,
} from "../contracts/verification";
import { DEV_USERS } from "../lib/session/dev-users";
import productionWorker from "./api-worker";
import { getCarryovers, getDecision } from "./room/decisions";
import { getIdeaMapSizeState } from "./room/idea-map";
import { listNotes, moveNote } from "./room/notes";
import { countUserVotes } from "./room/votes";
import { connectRoomAs, sessionCookieFor } from "./test-helpers";
import verificationWorker from "./verification-worker";

const TOKEN = "verification-test-token-at-least-32-characters";
const users = DEV_USERS.map((user) => ({ ...user, sub: user.id }));
async function headers(index = 0): Promise<Record<string, string>> {
  return {
    Cookie: await sessionCookieFor(users[index]),
    "Content-Type": "application/json",
    "X-Verification-Control-Token": TOKEN,
  };
}
async function create(checkpoint: string) {
  const res = await SELF.fetch("http://localhost/api/verification/rooms", {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ checkpoint }),
  });
  expect(res.status).toBe(200);
  return VerificationActiveSchema.parse(await res.json());
}
describe("検証環境の拒否境界", () => {
  it("本番入口・明示フラグなし・秘密なし・非localhostでは利用できない", async () => {
    const request = () =>
      new Request("http://localhost/api/verification/rooms", {
        method: "POST",
        headers: { "X-Verification-Control-Token": TOKEN },
      });
    const authorized = new Request(request(), { headers: await headers() });
    expect((await productionWorker.fetch(authorized, env)).status).toBe(404);
    expect(
      (
        await verificationWorker.fetch(request(), {
          ...env,
          IDEA_BOOST_VERIFY: "false",
          VERIFICATION_CONTROL_TOKEN: TOKEN,
        })
      ).status,
    ).toBe(404);
    expect(
      (await SELF.fetch("http://localhost/api/verification/active")).status,
    ).toBe(404);
    expect(
      (
        await SELF.fetch("https://example.com/api/verification/active", {
          headers: await headers(),
        })
      ).status,
    ).toBe(404);
    expect((await SELF.fetch(request())).status).toBe(401);
  });
  it("member・viewerは閲覧できるが作成できず、通常ルームには代理操作できない", async () => {
    for (const index of [1, 2]) {
      expect(
        (
          await SELF.fetch("http://localhost/api/verification/rooms", {
            method: "POST",
            headers: await headers(index),
            body: JSON.stringify({ checkpoint: "3-1" }),
          })
        ).status,
      ).toBe(403);
    }
    const active = await create("2-3");
    for (const index of [1, 2]) {
      const response = await SELF.fetch(
        "http://localhost/api/verification/active",
        { headers: await headers(index) },
      );
      expect(await response.json()).toEqual({ active });
    }
    const normal = await SELF.fetch("http://localhost/api/rooms", {
      method: "POST",
      headers: await headers(),
    });
    const room = await normal.json<{ roomId: string }>();
    expect(
      (
        await SELF.fetch(
          `http://localhost/api/verification/rooms/${room.roomId}/vote`,
          {
            method: "POST",
            headers: await headers(),
            body: JSON.stringify({ phase: 1, step: 4 }),
          },
        )
      ).status,
    ).toBe(404);
  });
});
describe("検証用の初期状態", () => {
  it("古い代理操作を拒否しても、開いているボードの接続は維持する", async () => {
    const active = await create("2-3");
    const owner = await connectRoomAs(users[0], active.roomId);
    const snapshot = await owner.next();
    if (snapshot.type !== "snapshot") throw new Error("snapshot が必要です");
    const closed = new Promise<{ type: "closed" }>((resolve) => {
      owner.ws.addEventListener("close", () => resolve({ type: "closed" }));
    });
    const response = await SELF.fetch(
      `http://localhost/api/verification/rooms/${active.roomId}/vote`,
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ phase: 3, step: 4 }),
      },
    );
    expect(response.status).toBe(409);
    owner.ws.send(
      JSON.stringify({
        type: "phase:next",
        force: true,
        expectedPhase: snapshot.phase,
        expectedRevision: snapshot.phaseRevision,
      }),
    );
    const next = await Promise.race([closed, owner.next()]);
    expect(next).toMatchObject({
      type: "snapshot",
      phase: { kind: "step", phase: 2, step: 4 },
    });
    owner.close();
  });
  it("代理投票は残りの2人だけを完了し、再実行でも票を増やさない", async () => {
    const active = await create("2-3");
    const url = `http://localhost/api/verification/rooms/${active.roomId}/vote`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await SELF.fetch(url, {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ phase: 2, step: 3 }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ completedOtherVoters: 2 });
    }
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(active.roomId));
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        users.map((user) => [
          countUserVotes(state.storage.sql, user.sub, "subjective", 2),
          countUserVotes(state.storage.sql, user.sub, "objective", 2),
        ]),
      ).toEqual([
        [0, 0],
        [1, 3],
        [1, 3],
      ]);
    });
    expect(
      (
        await SELF.fetch(url, {
          method: "POST",
          headers: await headers(),
          body: JSON.stringify({ phase: 3, step: 4 }),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await SELF.fetch(url, {
          method: "POST",
          headers: await headers(1),
          body: JSON.stringify({ phase: 2, step: 3 }),
        })
      ).status,
    ).toBe(403);
  });
  it("通常の開始操作でも自分の下書き4枚が届き、削除・再接続で再投入されない", async () => {
    const active = await create("lobby");
    const owner = await connectRoomAs(users[0], active.roomId);
    await owner.next();
    const member = await connectRoomAs(users[1], active.roomId);
    await member.next();
    owner.ws.send(JSON.stringify({ type: "start_phase" }));
    for (const [index, socket] of [owner, member].entries()) {
      const noteIds: string[] = [];
      while (noteIds.length < 4) {
        const message = await socket.next();
        if (message.type !== "note:inserted") continue;
        expect(message.note.authorId).toBe(users[index].sub);
        noteIds.push(message.note.id);
      }
      if (index === 0) {
        owner.ws.send(
          JSON.stringify({ type: "note:delete", noteId: noteIds[0] }),
        );
        while ((await owner.next()).type !== "note:deleted") {
          /* 後続の通知を待つ */
        }
      }
    }
    owner.close();
    member.close();
    const reconnected = await connectRoomAs(users[0], active.roomId);
    const snapshot = await reconnected.next();
    expect(snapshot.type).toBe("snapshot");
    if (snapshot.type === "snapshot") expect(snapshot.notes).toHaveLength(3);
    reconnected.close();
  });
  it("用意した共有付箋を動かすと、初期配置した全付箋より前面へ出る", async () => {
    const active = await create("1-2");
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(active.roomId));
    await runInDurableObject(stub, (_instance, state) => {
      const notes = listNotes(state.storage.sql, users[0].sub, 1);
      const target = notes.find((note) => note.visibility === "shared");
      if (!target) throw new Error("共有付箋がありません");
      const top = Math.max(...notes.map((note) => note.stackOrder));
      expect(
        moveNote(
          state.storage.sql,
          target.id,
          800,
          500,
          new Date().toISOString(),
        ),
      ).toBeGreaterThan(top);
    });
  });
  it.each([
    "3-2",
    "3-3",
  ])("%sの検証ルームはOwnerがマップの広さを変更できる状態で始まる", async (checkpoint) => {
    const active = await create(checkpoint);
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(active.roomId));

    await runInDurableObject(stub, (_instance, state) => {
      expect(getIdeaMapSizeState(state.storage.sql)).toEqual({
        sizeLevel: 0,
        initialized: true,
      });
    });
  });
  it.each([
    "lobby",
    "1-1",
    "1-2",
    "1-3",
    "1-4",
    "1-5",
    "2-1",
    "2-2",
    "2-3",
    "2-4",
    "3-1",
    "3-2",
    "3-3",
    "3-4",
    "3-5",
  ])("%sを既存3アカウントで構築する", async (checkpoint) => {
    const active = await create(checkpoint);
    const target = VERIFICATION_CHECKPOINTS.find(
      (item) => item.id === checkpoint,
    )?.phase;
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(active.roomId));
    expect((await stub.listMembers()).map((m) => m.userId).sort()).toEqual(
      users.map((u) => u.sub).sort(),
    );
    await runInDurableObject(stub, (_instance, state) => {
      if (!target || target.kind === "lobby") return;
      const notes = listNotes(state.storage.sql, users[0].sub, target.phase);
      expect(notes).toHaveLength(12);
      expect(
        users.map(
          (user) => notes.filter((note) => note.authorId === user.sub).length,
        ),
      ).toEqual([4, 4, 4]);
      expect(notes.filter((note) => note.visibility === "shared")).toHaveLength(
        target.step === 1 ? 0 : target.step === 2 ? 9 : 12,
      );
      expect(getDecision(state.storage.sql, target.phase)).toBeNull();
      expect(getCarryovers(state.storage.sql, target.phase)).toHaveLength(
        target.phase - 1,
      );
      if (isResultStep(target)) {
        expect(
          notes.some(
            (note) =>
              (note.dotVotes.subjective.count ?? 0) +
                (note.dotVotes.objective.count ?? 0) ===
              0,
          ),
        ).toBe(true);
      }
    });
  });
  it("2-3から3-1への切替を全ユーザーが取得でき、元ルームのデータは残る", async () => {
    const previous = await create("2-3");
    const next = await create("3-1");
    expect(previous.roomId).not.toBe(next.roomId);
    for (const index of [0, 1, 2]) {
      const response = await SELF.fetch(
        "http://localhost/api/verification/active",
        { headers: await headers(index) },
      );
      expect(await response.json()).toEqual({ active: next });
      const socket = await connectRoomAs(users[index], next.roomId);
      const snapshot = await socket.next();
      expect(snapshot).toMatchObject({
        type: "snapshot",
        phase: { kind: "step", phase: 3, step: 1 },
      });
      if (snapshot.type === "snapshot") {
        expect(snapshot.notes).toHaveLength(4);
        expect(
          snapshot.notes.every((note) => note.authorId === users[index].sub),
        ).toBe(true);
      }
      socket.close();
    }
    expect(
      (
        await SELF.fetch(`http://localhost/api/rooms/${previous.roomId}`, {
          headers: await headers(),
        })
      ).status,
    ).toBe(200);
  });
});
