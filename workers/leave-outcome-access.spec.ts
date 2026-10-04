import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "./api-worker";
import {
  createRoomAs,
  joinRoomAs,
  runInRoomDO,
  sessionCookieFor,
} from "./test-helpers";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "Host",
  email: "host@test.invalid",
};
const guest = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "Guest",
  email: "guest@test.invalid",
};
const outsider = {
  sub: "33333333-3333-4333-8333-333333333333",
  name: "Other",
  email: "other@test.invalid",
};
async function request(
  path: string,
  user = guest,
  method = "GET",
  body?: unknown,
) {
  return worker.fetch(
    new Request(`https://api.test/api/${path}`, {
      method,
      headers: {
        Cookie: await sessionCookieFor(user),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}
async function roomWithGuest() {
  const room = await createRoomAs(host);
  await joinRoomAs(guest, room.inviteCode);
  return room;
}
async function publish(roomId: string) {
  await runInRoomDO(roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, host.sub);
    for (const phase of [1, 2, 3])
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
        phase,
        crypto.randomUUID(),
        `決定${phase}`,
        host.sub,
        new Date().toISOString(),
      );
    await (
      instance as unknown as {
        preserveSharedOutcome(
          confirmed: boolean,
          now: number,
          participant: boolean,
        ): Promise<void>;
      }
    ).preserveSharedOutcome(true, Date.now(), true);
    await instance.alarm();
  });
}
async function leave(roomId: string, access: string | undefined, user = guest) {
  return request(`rooms/${roomId}/leave`, user, "POST", {
    intent: "self",
    outcomeAccess: access,
  });
}

describe("退出時の成果閲覧選択", () => {
  it("非参加者は保持を指定しても成果の取得権を作れず、未認証も退出できない", async () => {
    const room = await roomWithGuest();
    expect((await leave(room.roomId, "retain", outsider)).status).toBe(404);
    expect(
      (
        await worker.fetch(
          new Request(`https://api.test/api/rooms/${room.roomId}/leave`, {
            method: "POST",
            body: JSON.stringify({ intent: "self", outcomeAccess: "retain" }),
          }),
          env,
        )
      ).status,
    ).toBe(401);
    await publish(room.roomId);
    expect(
      (await request(`completed-rooms/${room.roomId}`, outsider)).status,
    ).toBe(404);
  });
  it("保持して途中退出した本人は作業へのアクセスを失い、完了後だけ一覧・成果・場面を閲覧できる", async () => {
    const room = await roomWithGuest();
    expect((await leave(room.roomId, "retain")).status).toBe(204);
    for (const suffix of ["", "/members"])
      expect((await request(`rooms/${room.roomId}${suffix}`)).status).toBe(404);
    expect(
      (
        await worker.fetch(
          new Request(`https://api.test/api/rooms/${room.roomId}/ws`, {
            headers: {
              Cookie: await sessionCookieFor(guest),
              Upgrade: "websocket",
            },
          }),
          env,
        )
      ).status,
    ).toBe(404);
    expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(404);
    await publish(room.roomId);
    expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(200);
    expect(
      (await request(`completed-rooms/${room.roomId}/scenes/problem-grouping`))
        .status,
    ).toBe(200);
    expect(await (await request("completed-rooms")).json()).toMatchObject({
      rooms: expect.arrayContaining([
        expect.objectContaining({ roomId: room.roomId }),
      ]),
    });
  });
  it.each([
    "discard",
    undefined,
  ])("%sで途中退出した本人の一覧・成果・場面は残らない", async (access) => {
    const room = await roomWithGuest();
    expect((await leave(room.roomId, access)).status).toBe(204);
    await publish(room.roomId);
    expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(404);
    expect(
      (await request(`completed-rooms/${room.roomId}/scenes/problem-grouping`))
        .status,
    ).toBe(404);
    expect(
      (
        (await (await request("completed-rooms")).json()) as {
          rooms: Array<{ roomId: string }>;
        }
      ).rooms.some((item) => item.roomId === room.roomId),
    ).toBe(false);
  });
  it("再参加後の最後の退出選択で保持を決め、保持済み退出者へ二重付与しない", async () => {
    const room = await roomWithGuest();
    await leave(room.roomId, "retain");
    await joinRoomAs(guest, room.inviteCode);
    await leave(room.roomId, "discard");
    await publish(room.roomId);
    expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(404);
  });
  it("完了が先でも明示discardで閲覧権を撤回し、古いD1索引から本文を返さない", async () => {
    const room = await roomWithGuest();
    await publish(room.roomId);
    expect((await leave(room.roomId, "discard")).status).toBe(204);
    // 古い投影の残存を再現。索引の本文を信頼せずDOを通す。
    await env.DB.prepare(
      "INSERT INTO completed_room_viewers(user_id,room_id,completed_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(user_id,room_id) DO NOTHING",
    )
      .bind(guest.sub, room.roomId, Date.now(), Date.now() + 86400000)
      .run();
    expect(
      (
        (await (await request("completed-rooms")).json()) as {
          rooms: Array<{ roomId: string }>;
        }
      ).rooms.some((item) => item.roomId === room.roomId),
    ).toBe(false);
    expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(404);
    expect(
      (await request(`completed-rooms/${room.roomId}/scenes/problem-grouping`))
        .status,
    ).toBe(404);
    expect((await request(`completed-rooms/${room.roomId}`, host)).status).toBe(
      200,
    );
    await runInRoomDO(room.roomId, (instance, state) => {
      state.storage.sql.exec(
        "UPDATE completed_room SET retry_at=?",
        Date.now(),
      );
      return instance.alarm();
    });
    expect(
      await env.DB.prepare(
        "SELECT room_id FROM completed_room_viewers WHERE user_id=? AND room_id=?",
      )
        .bind(guest.sub, room.roomId)
        .first(),
    ).toBeNull();
  });
  it("不正な選択を黙って保持せず400で拒否する", async () => {
    const room = await roomWithGuest();
    expect((await leave(room.roomId, "invalid")).status).toBe(400);
    expect((await request(`rooms/${room.roomId}`)).status).toBe(200);
  });
});

it("投影のI/O中のdiscardも直ちに拒否し、古い投影の成功で新しい再試行を消さない", async () => {
  const room = await roomWithGuest();
  await publish(room.roomId);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const completed = (
      instance as unknown as {
        completed: { db: D1Database; flush(): Promise<void> };
      }
    ).completed;
    const original = completed.db;
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    completed.db = {
      prepare: original.prepare.bind(original),
      batch: async (statements: D1PreparedStatement[]) => {
        entered();
        await gate;
        return original.batch(statements);
      },
    } as D1Database;
    try {
      state.storage.sql.exec(
        "UPDATE completed_room SET retry_at=?",
        Date.now(),
      );
      const flushing = completed.flush();
      await started;
      const leaving = instance.leave(guest.sub, "discard");
      expect(await instance.getCompletedRoom(guest.sub)).toBeNull();
      expect(
        await instance.getCompletedBoard(guest.sub, "problem-grouping"),
      ).toBeNull();
      release();
      await flushing;
      await leaving;
      expect(
        state.storage.sql.exec("SELECT retry_at FROM completed_room").one()
          .retry_at,
      ).not.toBeNull();
    } finally {
      release();
      completed.db = original;
    }
  });
  // 古いI/Oが復活させた索引が残る状態でも、一覧から成果本文を返さない。
  expect(
    await env.DB.prepare(
      "SELECT room_id FROM completed_room_viewers WHERE user_id=? AND room_id=?",
    )
      .bind(guest.sub, room.roomId)
      .first(),
  ).not.toBeNull();
  expect(
    (
      (await (await request("completed-rooms")).json()) as {
        rooms: Array<{ roomId: string }>;
      }
    ).rooms.some((item) => item.roomId === room.roomId),
  ).toBe(false);
  await runInRoomDO(room.roomId, (instance) => instance.alarm());
  expect(
    await env.DB.prepare(
      "SELECT room_id FROM completed_room_viewers WHERE user_id=? AND room_id=?",
    )
      .bind(guest.sub, room.roomId)
      .first(),
  ).toBeNull();
});

it("retain退出後に再参加して完了した在籍者を重複させず、完了後のretainと未指定退出は権利・期限を保つ", async () => {
  for (const access of ["retain", undefined]) {
    const room = await roomWithGuest();
    await leave(room.roomId, "retain");
    await joinRoomAs(guest, room.inviteCode);
    await publish(room.roomId);
    const before = await (
      await request(`completed-rooms/${room.roomId}`)
    ).json();
    await leave(room.roomId, access);
    expect(
      await (await request(`completed-rooms/${room.roomId}`)).json(),
    ).toEqual(before);
    await runInRoomDO(room.roomId, (_instance, state) => {
      const viewers = JSON.parse(
        String(
          state.storage.sql
            .exec("SELECT viewers_json FROM completed_room")
            .one().viewers_json,
        ),
      ) as string[];
      expect(viewers.filter((id) => id === guest.sub)).toHaveLength(1);
    });
  }
});

it("未完了ルームの保存期限切れと解散で保持退出者のアカウントIDを消す", async () => {
  for (const action of ["expire", "disband"]) {
    const room = await roomWithGuest();
    await leave(room.roomId, "retain");
    await runInRoomDO(room.roomId, async (instance, state) => {
      expect(
        state.storage.sql
          .exec("SELECT * FROM retained_outcome_participants")
          .toArray(),
      ).toEqual([{ user_id: guest.sub }]);
      if (action === "disband") await instance.disband(host.sub);
      else {
        state.storage.sql.exec(
          "UPDATE shared_outcome_state SET expires_at=?",
          Date.now(),
        );
        await instance.alarm();
      }
      expect(
        state.storage.sql
          .exec("SELECT * FROM retained_outcome_participants")
          .toArray(),
      ).toEqual([]);
    });
  }
});

it("保存期限を過ぎてからの退出で消去済みの参加者記録を復活させない", async () => {
  const room = await roomWithGuest();
  await runInRoomDO(room.roomId, async (instance, state) => {
    state.storage.sql.exec(
      "UPDATE shared_outcome_state SET expires_at=?",
      Date.now(),
    );
    await instance.alarm();
  });
  expect((await leave(room.roomId, "retain")).status).toBe(204);
  await runInRoomDO(room.roomId, (_instance, state) => {
    expect(
      state.storage.sql
        .exec("SELECT * FROM retained_outcome_participants")
        .toArray(),
    ).toEqual([]);
  });
});

it("保全導入前の既存ルームからのretain退出にも再訪希望を記録する", async () => {
  const room = await roomWithGuest();
  await runInRoomDO(room.roomId, (_instance, state) => {
    state.storage.sql.exec("DELETE FROM shared_outcome_state");
    state.storage.sql.exec("DELETE FROM shared_outcome_identity");
  });
  expect((await leave(room.roomId, "retain")).status).toBe(204);
  await runInRoomDO(room.roomId, (_instance, state) => {
    expect(
      state.storage.sql
        .exec("SELECT * FROM retained_outcome_participants")
        .toArray(),
    ).toEqual([{ user_id: guest.sub }]);
  });
  await publish(room.roomId);
  expect((await request(`completed-rooms/${room.roomId}`)).status).toBe(200);
});
