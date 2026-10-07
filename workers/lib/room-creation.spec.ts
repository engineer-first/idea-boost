import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "../../contracts/phase.fixture";
import { issueCreationId } from "../../contracts/room-creation";
import { savePhase } from "../room/phase";
import { runInRoomDO, sessionCookieFor } from "../test-helpers";
import { ensureUser } from "./db";
import {
  CreationConflict,
  CreationGone,
  completeRoomCreation,
  readCreationRequest,
  reserveRoomCreation,
} from "./room-creation";

const USER = {
  sub: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  name: "Owner",
};
const OUTSIDER = {
  sub: "22222222-2222-4222-8222-222222222222",
  email: "other@example.test",
  name: "Other",
};
async function reserve(name = "test", requestId = issueCreationId().requestId) {
  await ensureUser(env.DB, { id: USER.sub, email: USER.email });
  return reserveRoomCreation(env.DB, USER.sub, requestId, name);
}
async function post(requestId: string, name: string, user = USER) {
  return SELF.fetch("https://api.test/api/rooms", {
    method: "POST",
    headers: {
      Cookie: await sessionCookieFor(user),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requestId, name, expectedPrincipal: user.sub }),
  });
}
function initialize(c: Awaited<ReturnType<typeof reserve>>) {
  return env.ROOM_DO.get(env.ROOM_DO.idFromName(c.room_id))
    .initializeCreation(
      {
        creator: c.user_id,
        roomId: c.room_id,
        requestId: c.request_id,
        expiresAt: c.expires_at,
      },
      USER.name,
      c.name,
    )
    .then((result) => {
      if (result !== "ready") throw new Error("終了したルームです。");
    });
}

describe("作成要求の障害回復", () => {
  it("D1成功後DO失敗はpendingを保持し、API再試行が同じルームを成立させる", async () => {
    const creation = await reserve();
    await expect(
      completeRoomCreation(env.DB, creation, async () => {
        throw new Error("DO unavailable");
      }),
    ).rejects.toThrow();
    expect(
      (await readCreationRequest(env.DB, USER.sub, creation.request_id))
        ?.status,
    ).toBe("pending");
    const response = await post(creation.request_id, "test");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      roomId: creation.room_id,
      inviteCode: creation.invite_code,
    });
    expect(
      (await readCreationRequest(env.DB, USER.sub, creation.request_id))
        ?.status,
    ).toBe("ready");
  });

  it("DO成功応答喪失後も同じDOを再開し、工程と参加者を維持する", async () => {
    const creation = await reserve();
    await expect(
      completeRoomCreation(env.DB, creation, async () => {
        await initialize(creation);
        throw new Error("response lost");
      }),
    ).rejects.toThrow();
    const phase = buildPhaseStep(1);
    await runInRoomDO(creation.room_id, async (instance, state) => {
      await instance.upsertMember(OUTSIDER.sub, OUTSIDER.name);
      savePhase(state.storage.sql, phase);
    });
    const response = await post(creation.request_id, "test");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      roomId: creation.room_id,
      inviteCode: creation.invite_code,
    });
    await runInRoomDO(creation.room_id, (instance) => {
      expect(instance.getPhase()).toEqual(phase);
      expect(instance.isMember(OUTSIDER.sub)).toBe(true);
    });
  });

  it("作成中の招待・情報・members・WSは第三者にも作成者にも開かない", async () => {
    const creation = await reserve();
    for (const user of [USER, OUTSIDER]) {
      const cookie = await sessionCookieFor(user);
      for (const path of [
        `/api/rooms/${creation.room_id}`,
        `/api/rooms/${creation.room_id}/members`,
        `/api/rooms/${creation.room_id}/ws`,
        `/api/rooms/lookup?code=${creation.invite_code}`,
      ]) {
        expect(
          (
            await SELF.fetch(`https://api.test${path}`, {
              headers: { Cookie: cookie, Upgrade: "websocket" },
            })
          ).status,
        ).toBe(404);
      }
      expect(
        (
          await SELF.fetch("https://api.test/api/rooms/join", {
            method: "POST",
            headers: { Cookie: cookie, "Content-Type": "application/json" },
            body: JSON.stringify({ code: creation.invite_code }),
          })
        ).status,
      ).toBe(404);
    }
  });

  it("他ユーザーの同IDは元の結果を取得せず別の意図として作る", async () => {
    const creation = await reserve();
    const response = await post(creation.request_id, "test", OUTSIDER);
    expect(response.status).toBe(200);
    expect((await response.json<{ roomId: string }>()).roomId).not.toBe(
      creation.room_id,
    );
    expect((await post(creation.request_id, "changed")).status).toBe(409);
    expect(
      (await readCreationRequest(env.DB, USER.sub, creation.request_id))
        ?.status,
    ).toBe("pending");
  });

  it("招待コード衝突のbatchをrollbackして次のコードで予約する", async () => {
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM room_creation_requests",
    ).first<{ count: number }>();
    const first = await reserve();
    let calls = 0;
    const second = await reserveRoomCreation(
      env.DB,
      USER.sub,
      issueCreationId().requestId,
      "test",
      () => (++calls === 1 ? first.invite_code : "ABC234"),
    );
    expect(second.invite_code).toBe("ABC234");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM room_creation_requests",
    ).first<{ count: number }>();
    expect(count?.count).toBe((before?.count ?? 0) + 2);
  });

  it.each([
    "pending",
    "ready",
  ] as const)("%s要求のルーム削除後も墓標が残り復活しない", async (status) => {
    const creation = await reserve();
    if (status === "ready")
      await completeRoomCreation(env.DB, creation, () => initialize(creation));
    await env.DB.prepare("DELETE FROM rooms WHERE id=?")
      .bind(creation.room_id)
      .run();
    expect((await post(creation.request_id, "test")).status).toBe(410);
    const record = await reserveRoomCreation(
      env.DB,
      USER.sub,
      creation.request_id,
      "test",
    );
    await expect(
      completeRoomCreation(env.DB, record, async () => {
        throw new Error("must not initialize");
      }),
    ).rejects.toBeInstanceOf(CreationGone);
    expect(record.room_id).toBe(creation.room_id);
  });

  it("ready再送はDOを呼ばず進行状態を変更しない", async () => {
    const creation = await reserve();
    await completeRoomCreation(env.DB, creation, () => initialize(creation));
    const ready = await readCreationRequest(
      env.DB,
      USER.sub,
      creation.request_id,
    );
    if (!ready) throw new Error("missing request");
    await completeRoomCreation(env.DB, ready, async () => {
      throw new Error("must not initialize");
    });
    await expect(
      reserveRoomCreation(env.DB, USER.sub, creation.request_id, "changed"),
    ).rejects.toBeInstanceOf(CreationConflict);
  });
  it("省略・空欄・空白名は同じ入力として同じ予約を返す", async () => {
    const creation = await reserve("");
    for (const name of [undefined, "", "  "]) {
      expect(
        (await reserveRoomCreation(env.DB, USER.sub, creation.request_id, name))
          .room_id,
      ).toBe(creation.room_id);
    }
  });

  it("DO marker・初期状態・outboxのtransactionが失敗した場合は全体をrollbackする", async () => {
    const creation = await reserve();
    await runInRoomDO(creation.room_id, (_instance, state) => {
      state.storage.sql.exec(
        "CREATE TRIGGER reject_marker BEFORE INSERT ON room_creation_marker BEGIN SELECT RAISE(ABORT, 'marker failure'); END",
      );
    });
    await runInRoomDO(creation.room_id, async (instance) => {
      await expect(
        instance.initializeCreation(
          {
            creator: USER.sub,
            roomId: creation.room_id,
            requestId: creation.request_id,
            expiresAt: creation.expires_at,
          },
          USER.name,
          creation.name,
        ),
      ).rejects.toThrow("marker failure");
    });
    await runInRoomDO(creation.room_id, (_instance, state) => {
      for (const table of [
        "members",
        "room_creation_marker",
        "shared_outcome_identity",
        "shared_outcome_state",
      ]) {
        expect(
          state.storage.sql.exec(`SELECT * FROM ${table}`).toArray(),
        ).toEqual([]);
      }
      state.storage.sql.exec("DROP TRIGGER reject_marker");
    });
    expect((await post(creation.request_id, "test")).status).toBe(200);
  });

  it("ready保存失敗後の再試行がoutboxを維持し同じ予約を成立させる", async () => {
    const creation = await reserve();
    await env.DB.prepare(
      "CREATE TRIGGER reject_ready BEFORE UPDATE ON room_creation_requests BEGIN SELECT RAISE(ABORT, 'ready failure'); END",
    ).run();
    expect((await post(creation.request_id, "test")).status).toBe(503);
    const before = await runInRoomDO(creation.room_id, (_instance, state) =>
      state.storage.sql.exec("SELECT * FROM shared_outcome_state").one(),
    );
    expect(before.saved_json ?? before.pending_json).toBeTruthy();
    await env.DB.prepare("DROP TRIGGER reject_ready").run();
    expect((await post(creation.request_id, "test")).status).toBe(200);
    const after = await runInRoomDO(creation.room_id, (_instance, state) =>
      state.storage.sql.exec("SELECT * FROM shared_outcome_state").one(),
    );
    expect(after.expires_at).toBe(before.expires_at);
    expect(after.saved_json ?? after.pending_json).toBe(
      before.saved_json ?? before.pending_json,
    );
  });

  it.each([
    "completed",
    "disbanded",
    "expired",
  ])("%sのDOへ遅延初期化しても状態を復活させない", async (kind) => {
    const creation = await reserve();
    await initialize(creation);
    if (kind === "disbanded")
      await env.ROOM_DO.get(env.ROOM_DO.idFromName(creation.room_id)).disband(
        USER.sub,
      );
    else
      await runInRoomDO(creation.room_id, (_instance, state) => {
        if (kind === "completed")
          state.storage.sql.exec(
            "UPDATE room_state SET outcome_published=1 WHERE id=1",
          );
        else
          state.storage.sql.exec(
            "UPDATE shared_outcome_state SET expires_at=0 WHERE id=1",
          );
        savePhase(state.storage.sql, buildPhaseStep(1));
      });
    const before = await runInRoomDO(creation.room_id, (_instance, state) => ({
      phase: state.storage.sql.exec("SELECT * FROM room_state").one(),
      members: state.storage.sql.exec("SELECT * FROM members").toArray(),
      marker: state.storage.sql
        .exec("SELECT * FROM room_creation_marker")
        .one(),
    }));
    await runInRoomDO(creation.room_id, async (instance) => {
      await expect(
        instance.initializeCreation(
          {
            creator: USER.sub,
            roomId: creation.room_id,
            requestId: creation.request_id,
            expiresAt: creation.expires_at,
          },
          USER.name,
          creation.name,
        ),
      ).resolves.toBe("closed");
    });
    const after = await runInRoomDO(creation.room_id, (_instance, state) => ({
      phase: state.storage.sql.exec("SELECT * FROM room_state").one(),
      members: state.storage.sql.exec("SELECT * FROM members").toArray(),
      marker: state.storage.sql
        .exec("SELECT * FROM room_creation_marker")
        .one(),
    }));
    expect(after).toEqual(before);
  });
});

it.each([
  "completed",
  "disbanded",
  "expired",
])("pendingの%s後はAPI再送を確定拒否し復活させない", async (kind) => {
  const creation = await reserve();
  await initialize(creation);
  if (kind === "disbanded")
    await env.ROOM_DO.get(env.ROOM_DO.idFromName(creation.room_id)).disband(
      USER.sub,
    );
  else
    await runInRoomDO(creation.room_id, (_instance, state) => {
      state.storage.sql.exec(
        kind === "completed"
          ? "UPDATE room_state SET outcome_published=1 WHERE id=1"
          : "UPDATE shared_outcome_state SET expires_at=0 WHERE id=1",
      );
    });
  expect((await post(creation.request_id, "test")).status).toBe(410);
  expect(
    (await readCreationRequest(env.DB, USER.sub, creation.request_id))?.room_id,
  ).toBe(creation.room_id);
});
