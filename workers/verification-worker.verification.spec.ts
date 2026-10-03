import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../contracts/access";
import { isResultStep } from "../contracts/phase";
import { TOKEN_AUDIENCE } from "../contracts/session";
import {
  VERIFICATION_CHECKPOINTS,
  VerificationActiveSchema,
} from "../contracts/verification";
import { DEV_USERS } from "../lib/session/dev-users";
import { signToken } from "../lib/session/token";
import productionWorker from "./api-worker";
import { getCarryovers, getDecision } from "./room/decisions";
import { getIdeaMapSizeState } from "./room/idea-map";
import { listNotes, moveNote } from "./room/notes";
import { countUserVotes } from "./room/votes";
import { connectRoomAs, sessionCookieFor } from "./test-helpers";
import verificationWorker from "./verification-worker";

const TOKEN = "verification-test-token-at-least-32-characters";
const users = DEV_USERS.map((user) => ({ ...user, sub: user.id }));
it("検証用ログイン後にOwnerだけが成果閲覧と管理を利用できる", async () => {
  const member = DEV_USERS[1];
  const assertion = await signToken(
    { kind: "dev", userId: member.id, email: member.email, name: member.name },
    {
      secret: env.SESSION_SECRET,
      audience: TOKEN_AUDIENCE.loginAssertion,
      expiresInSeconds: 60,
    },
  );
  expect(
    (
      await SELF.fetch("http://localhost/api/auth/sync", {
        method: "POST",
        body: JSON.stringify({ assertion }),
      })
    ).status,
  ).toBe(200);
  const ownerCookie = await sessionCookieFor(users[0]);
  const memberCookie = await sessionCookieFor(users[1]);
  expect(
    (
      await SELF.fetch("http://localhost/api/shared-outcomes", {
        headers: { Cookie: ownerCookie },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await SELF.fetch("http://localhost/api/admin/access", {
        headers: { Cookie: ownerCookie },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await SELF.fetch("http://localhost/api/shared-outcomes", {
        headers: { Cookie: memberCookie },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await SELF.fetch("http://localhost/api/admin/access", {
        headers: { Cookie: memberCookie },
      })
    ).status,
  ).toBe(403);
  const permissions = await env.DB.prepare(
    "SELECT permission FROM user_permissions WHERE user_id=? ORDER BY permission",
  )
    .bind(DEV_USERS[0].id)
    .all<{ permission: string }>();
  expect(permissions.results.map((row) => row.permission)).toEqual([
    PERMISSIONS.manageSharedOutcomesAccess,
    PERMISSIONS.readSharedOutcomes,
  ]);
});
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
  it.each(["3-2", "3-3"])(
    "%sの検証ルームはOwnerがマップの広さを変更できる状態で始まる",
    async (checkpoint) => {
      const active = await create(checkpoint);
      const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(active.roomId));

      await runInDurableObject(stub, (_instance, state) => {
        expect(getIdeaMapSizeState(state.storage.sql)).toEqual({
          sizeLevel: 0,
          initialized: true,
        });
      });
    },
  );
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

describe("成果の検証入口", () => {
  it("セッションのない呼び出しでは状態準備できない", async () => {
    const viewer = await SELF.fetch(
      "http://localhost/api/verification/outcomes",
      {
        method: "POST",
        headers: { Authorization: "Bearer old-secret" },
        body: JSON.stringify({ scenario: "partial" }),
      },
    );
    expect(viewer.status).toBe(404);
  });
});

it("成果ケースは実保存を通り、失敗から同じ完了記録をアラームで復旧する", async () => {
  async function outcome(scenario: string, roomName = "同名の検証") {
    const response = await SELF.fetch(
      "http://localhost/api/verification/outcomes",
      {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ scenario, roomName }),
      },
    );
    expect(response.status).toBe(200);
    const active = VerificationActiveSchema.parse(await response.json());
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(active.roomId));
    return { active, stub };
  }
  const partial = await outcome("partial");
  const partialRecord = await partial.stub.getSharedOutcome();
  expect(partialRecord?.status).toBe("partial");
  expect(partialRecord?.snapshot?.notes).toHaveLength(35);
  expect(partialRecord?.snapshot?.groups).toHaveLength(2);
  expect(partialRecord?.snapshot?.notes.some((note) => note.excluded)).toBe(
    true,
  );
  const failed = await outcome("failure");
  expect(await failed.stub.getCompletedRoom(DEV_USERS[0].id)).not.toBeNull();
  const failedRecord = await failed.stub.getSharedOutcome();
  expect(failedRecord?.saveStatus).toBe("failed");
  expect(failedRecord?.lastSavedAt).not.toBeNull();
  expect(failedRecord?.snapshot?.decisions).toHaveLength(2);
  const recovered = await SELF.fetch(
    `http://localhost/api/verification/outcomes/${failed.active.roomId}/recover`,
    { method: "POST", headers: await headers(), body: "{}" },
  );
  expect(recovered.status).toBe(200);
  await runInDurableObject(failed.stub, async (instance, state) => {
    state.storage.sql.exec(
      "UPDATE shared_outcome_state SET retry_at = ? WHERE id = 1",
      Date.now(),
    );
    await instance.alarm();
  });
  const confirmed = await failed.stub.getSharedOutcome();
  expect(confirmed?.saveStatus).toBe("saved");
  expect(confirmed?.status).toBe("confirmed");
  expect(confirmed?.snapshot?.decisions).toHaveLength(3);
  expect(confirmed?.displayId).not.toBe(partialRecord?.displayId);
  const expired = await outcome("expired", "");
  expect(await expired.stub.getSharedOutcome()).toBeNull();
  expect(
    await env.DB.prepare(
      "SELECT room_id FROM shared_outcomes WHERE room_id = ?",
    )
      .bind(expired.active.roomId)
      .first(),
  ).toBeNull();
  const empty = await outcome("empty");
  expect((await empty.stub.getSharedOutcome())?.snapshot?.notes).toHaveLength(
    0,
  );
});

it.each(["before-initialize", "initialize", "prepare", "activate"])(
  "成果準備の%s失敗では失敗ルームを残さず、元の検証先を維持する",
  async (stage) => {
    const previous = await create("1-2");
    let failedId = "";
    const namespace = {
      idFromName: (name: string) => env.ROOM_DO.idFromName(name),
      get: (id: DurableObjectId) => {
        const stub = env.ROOM_DO.get(id) as unknown as {
          initializeVerification(
            checkpoint: string,
            roomId: string,
            name?: string,
          ): Promise<void>;
          prepareVerificationOutcome(scenario: string): Promise<void>;
          discardVerificationRoom(): Promise<void>;
        };
        return {
          async initializeVerification(
            checkpoint: string,
            roomId: string,
            name?: string,
          ) {
            failedId = roomId;
            if (stage === "before-initialize")
              throw new Error("before initialization");
            await stub.initializeVerification(checkpoint, roomId, name);
            if (stage === "initialize")
              throw new Error("initialization failed");
          },
          async prepareVerificationOutcome(scenario: string) {
            await stub.prepareVerificationOutcome(scenario);
            if (stage === "prepare") throw new Error("preparation failed");
          },
          discardVerificationRoom: () => stub.discardVerificationRoom(),
        };
      },
    } as unknown as typeof env.ROOM_DO;
    const workspace = {
      idFromName: () => "active",
      get: () => ({
        setActive: async () => {
          throw new Error("activation failed");
        },
      }),
    } as unknown as import("./verification-worker").VerificationWorkerEnv["VERIFICATION_WORKSPACE"];
    const response = await verificationWorker.fetch(
      new Request("http://localhost/api/verification/outcomes", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ scenario: "failure" }),
      }),
      {
        ...env,
        ROOM_DO: namespace,
        IDEA_BOOST_VERIFY: "true",
        VERIFICATION_CONTROL_TOKEN: TOKEN,
        ...(stage === "activate" ? { VERIFICATION_WORKSPACE: workspace } : {}),
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "検証状態の準備に失敗しました。",
    });
    expect(
      await env.DB.prepare("SELECT id FROM rooms WHERE id=?")
        .bind(failedId)
        .first(),
    ).toBeNull();
    const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(failedId));
    await runInDurableObject(stub, async (instance, state) => {
      if (stage !== "before-initialize") {
        await instance.alarm();
        expect(await instance.getSharedOutcome()).toBeNull();
      } else {
        expect((await state.storage.list()).size).toBe(0);
      }
      expect(await state.storage.getAlarm()).toBeNull();
    });
    expect(
      await env.DB.prepare(
        "SELECT room_id FROM shared_outcomes WHERE room_id=?",
      )
        .bind(failedId)
        .first(),
    ).toBeNull();
    const active = await SELF.fetch(
      "http://localhost/api/verification/active",
      {
        headers: await headers(),
      },
    );
    expect(await active.json()).toEqual({ active: previous });
  },
);
