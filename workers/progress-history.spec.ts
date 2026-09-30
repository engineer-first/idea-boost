import { describe, expect, it } from "vitest";
import { connectRoomAs, createRoomAs, runInRoomDO } from "./test-helpers";

const owner = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "Owner",
  email: "owner@test.invalid",
};
describe("節目の不変履歴", () => {
  it("受理した開始だけ開区間を作り、二重開始では増えない", async () => {
    const room = await createRoomAs(owner);
    const socket = await connectRoomAs(owner, room.roomId);
    await socket.next();
    socket.ws.send(JSON.stringify({ type: "start_phase" }));
    expect(await socket.next()).toMatchObject({ type: "phase:updated" });
    socket.ws.send(JSON.stringify({ type: "start_phase" }));
    expect(await socket.next()).toMatchObject({ type: "error" });
    await runInRoomDO(room.roomId, (_instance, state) => {
      const rows = state.storage.sql
        .exec("SELECT * FROM progress_history")
        .toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        sequence: 1,
        exited_at: null,
        save_status: "open",
      });
      expect(rows[0].entered_at).toEqual(expect.any(Number));
    });
    socket.close();
  });
});

import { env } from "cloudflare:test";
import { PERMISSIONS } from "../contracts/access";
import type { RoomPhase } from "../contracts/phase";
import type { ProgressHistoryResponse } from "../contracts/shared-outcomes";
import worker from "./api-worker";
import { RoomBroadcaster } from "./room/broadcast";
import {
  completeExpiredPhaseTransition,
  getPhaseRevision,
  phaseHandlers,
} from "./room/phase";
import { recordProgressTransition } from "./room/progress-history";
import { sessionCookieFor } from "./test-helpers";

function context(state: DurableObjectState) {
  return {
    sql: state.storage.sql,
    storage: state.storage,
    userId: owner.sub,
    ws: new WebSocketPair()[1],
    reply: () => {},
    broadcaster: new RoomBroadcaster(state),
    refreshSnapshots: () => {},
  };
}
function seed(state: DurableObjectState, phase = 1) {
  const id = crypto.randomUUID();
  state.storage.sql.exec(
    "INSERT INTO notes(id,author_id,content,x,y,created_at,updated_at,visibility,phase) VALUES(?,?,?,10,20,'2026-09-27','2026-09-27','shared',?)",
    id,
    owner.sub,
    "変更前の共有本文",
    phase,
  );
  return id;
}

it("再投票直前の公開票を未採用でも固定し、消去・移動・非公開化の後も独立して反映する", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const id = seed(state);
    await instance.setPhase({ kind: "step", phase: 1, step: 5 }, owner.sub);
    addVoteSticker(
      state.storage.sql,
      { id: crypto.randomUUID(), kind: "subjective", x: 0.2, y: 0.2 },
      id,
      owner.sub,
    );
    const phase = instance.getPhase();
    await phaseHandlers["phase:revote"](context(state), {
      type: "phase:revote",
      expectedPhase: phase,
      expectedRevision: getPhaseRevision(state.storage.sql),
    });
    const original = (await instance.getProgressHistory())?.entries[0];
    expect(original).toMatchObject({
      phase,
      action: "revote",
      enteredAt: null,
      saveStatus: "pending",
    });
    expect(
      (await instance.getProgressHistoryRecord(requireValue(original).id))
        ?.snapshot,
    ).toBeNull();
    const subject = instance as unknown as {
      writeProgressHistoryProjection(
        id: string,
        snapshot: string,
        expiry: number,
      ): Promise<void>;
    };
    const project = subject.writeProgressHistoryProjection.bind(subject);
    subject.writeProgressHistoryProjection = async () => {
      throw new Error("offline");
    };
    await instance.alarm();
    expect((await instance.getProgressHistory())?.entries[0].saveStatus).toBe(
      "failed",
    );
    state.storage.sql.exec(
      "UPDATE notes SET content='変更後',x=80,visibility='private' WHERE id=?",
      id,
    );
    // 次の盤面の保全が前の outbox を上書きしない。
    state.storage.transactionSync(() =>
      recordProgressTransition(
        state.storage.sql,
        instance.getPhase(),
        { kind: "step", phase: 1, step: 5 },
        "next",
      ),
    );
    subject.writeProgressHistoryProjection = project;
    await instance.alarm();
    const recovered = await instance.getProgressHistoryRecord(
      requireValue(original).id,
    );
    expect(recovered?.snapshot?.notes).toHaveLength(1);
    expect(recovered?.snapshot?.notes[0]).toMatchObject({
      content: "変更前の共有本文",
      x: 10,
      votes: { subjective: 1, objective: 0 },
    });
    expect(recovered?.exitedAt).toBe(original?.exitedAt);
    expect(JSON.stringify(recovered)).not.toContain(owner.sub);
    expect(JSON.stringify(recovered)).not.toContain("votedByMe");
    const rows = requireValue(await instance.getProgressHistory()).entries;
    expect(
      (await instance.getProgressHistoryRecord(rows[1].id))?.snapshot?.notes,
    ).toEqual([]);
  });
});

it("投票ステップを離れる時点では現在フェーズの票を保存しない", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const id = seed(state);
    await instance.setPhase({ kind: "step", phase: 1, step: 4 }, owner.sub);
    addVoteSticker(
      state.storage.sql,
      { id: crypto.randomUUID(), kind: "subjective", x: 0.2, y: 0.2 },
      id,
      owner.sub,
    );
    await phaseHandlers["phase:next"](context(state), {
      type: "phase:next",
      expectedPhase: instance.getPhase(),
      expectedRevision: getPhaseRevision(state.storage.sql),
      force: true,
    });
    await instance.alarm();
    const row = requireValue(await instance.getProgressHistory()).entries[0];
    expect(
      (await instance.getProgressHistoryRecord(row.id))?.snapshot?.notes[0]
        .votes,
    ).toBeNull();
  });
});

it("編集ステップの延期と拒否では増えず、期限成立時の書き足し移行を一度だけ記録する", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    seed(state);
    await instance.setPhase({ kind: "step", phase: 1, step: 2 }, owner.sub);
    const ctx = context(state);
    const message = {
      type: "phase:restart-writing" as const,
      expectedPhase: instance.getPhase(),
      expectedRevision: getPhaseRevision(state.storage.sql),
    };
    await phaseHandlers["phase:restart-writing"](ctx, message);
    await phaseHandlers["phase:restart-writing"](ctx, message);
    expect((await instance.getProgressHistory())?.entries).toEqual([]);
    state.storage.sql.exec("UPDATE pending_phase_transition SET deadline_at=0");
    await completeExpiredPhaseTransition(ctx);
    await completeExpiredPhaseTransition(ctx);
    expect((await instance.getProgressHistory())?.entries).toHaveLength(2);
    expect((await instance.getProgressHistory())?.entries[0]).toMatchObject({
      action: "restart-writing",
      enteredAt: null,
    });
    expect(instance.getPhase()).toEqual({ kind: "step", phase: 1, step: 1 });
  });
});

it("盤面抽出失敗は欠落として時刻を保全し、時刻自体の保存失敗はステップと同時にrollbackする", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const current: RoomPhase = { kind: "step", phase: 1, step: 3 };
    const next: RoomPhase = { kind: "step", phase: 1, step: 4 };
    await instance.setPhase(current, owner.sub);
    state.storage.transactionSync(() =>
      recordProgressTransition(
        state.storage.sql,
        current,
        next,
        "next",
        Date.now(),
        () => {
          throw new Error("cannot capture");
        },
      ),
    );
    const missing = requireValue(await instance.getProgressHistory())
      .entries[0];
    expect(missing).toMatchObject({
      saveStatus: "missing",
      exitedAt: expect.any(Number),
    });
    expect(
      (await instance.getProgressHistoryRecord(missing.id))?.snapshot,
    ).toBeNull();
    seed(state);
    state.storage.sql.exec(
      "CREATE TRIGGER reject_history BEFORE UPDATE ON progress_history BEGIN SELECT RAISE(ABORT,'history unavailable'); END",
    );
    await expect(
      phaseHandlers["phase:next"](context(state), {
        type: "phase:next",
        expectedPhase: current,
        expectedRevision: getPhaseRevision(state.storage.sql),
      }),
    ).rejects.toThrow("history unavailable");
    expect(instance.getPhase()).toEqual(current);
    expect((await instance.getProgressHistory())?.entries).toHaveLength(2);
  });
});

it("完了は一度だけ既存成果を参照し、盤面・outbox本文を二重保存しない", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, owner.sub);
    for (const phase of [1, 2])
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
        phase,
        crypto.randomUUID(),
        `決定${phase}`,
        owner.sub,
        new Date().toISOString(),
      );
    const id = seed(state, 3);
    state.storage.sql.exec(
      "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,?,?,?,'2026-09-27')",
      id,
      "最終案",
      owner.sub,
    );
  });
  const socket = await connectRoomAs(owner, room.roomId);
  await socket.next();
  for (let i = 0; i < 2; i++) {
    socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
    expect(await socket.next()).toMatchObject({ type: "outcome:published" });
  }
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.alarm();
    const rows = requireValue(await instance.getProgressHistory()).entries;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "complete",
      nextPhase: null,
      saveStatus: "saved",
    });
    expect(
      state.storage.sql.exec("SELECT * FROM progress_history_outbox").toArray(),
    ).toEqual([]);
    expect(
      (await instance.getProgressHistoryRecord(rows[0].id))?.snapshot,
    ).toEqual((await instance.getSharedOutcome())?.snapshot);
  });
  socket.close();
});

it("履歴一覧は本文なしで訪問順に分割し、空盤面を正常保存する", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const phase: RoomPhase = { kind: "step", phase: 1, step: 1 };
    await instance.setPhase(phase, owner.sub);
    for (let i = 0; i < 52; i++)
      state.storage.transactionSync(() =>
        recordProgressTransition(
          state.storage.sql,
          phase,
          phase,
          "next",
          Date.now() + i,
        ),
      );
    await instance.alarm();
    const first = requireValue(await instance.getProgressHistory());
    expect(first.entries).toHaveLength(50);
    expect(first.nextCursor).toBe("50");
    expect(JSON.stringify(first)).not.toContain("snapshot");
    const last = requireValue(
      await instance.getProgressHistory(Number(first.nextCursor)),
    );
    expect(last.entries.map((e) => e.sequence)).toEqual([51, 52, 53]);
    expect(last.nextCursor).toBeNull();
    expect(
      (await instance.getProgressHistoryRecord(first.entries[0].id))?.snapshot
        ?.notes,
    ).toEqual([]);
  });
});

it("未認証・権限なし・剥奪後・別ルームID・期限後を拒否し、解散後は期限まで保持する", async () => {
  const room = await createRoomAs(owner);
  const other = await createRoomAs(owner);
  const cookie = await sessionCookieFor(owner);
  const url = `https://api.test/api/shared-outcomes/${room.roomId}/history`;
  const request = (path = url, auth = true) =>
    new Request(path, { headers: auth ? { Cookie: cookie } : {} });
  expect((await worker.fetch(request(url, false), env)).status).toBe(401);
  expect((await worker.fetch(request(), env)).status).toBe(403);
  await env.DB.prepare(
    "INSERT INTO user_permissions(user_id,permission) VALUES(?,?)",
  )
    .bind(owner.sub, PERMISSIONS.readSharedOutcomes)
    .run();
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 1, step: 3 }, owner.sub);
    state.storage.transactionSync(() =>
      recordProgressTransition(
        state.storage.sql,
        instance.getPhase(),
        null,
        "next",
      ),
    );
    await instance.alarm();
    await instance.disband();
  });
  const response = await worker.fetch(request(), env);
  expect(response.status).toBe(200);
  const data = await response.json<ProgressHistoryResponse>();
  const id = data.entries[0].id;
  expect((await worker.fetch(request(`${url}/${id}`), env)).status).toBe(200);
  expect(
    (
      await worker.fetch(
        request(
          `https://api.test/api/shared-outcomes/${other.roomId}/history/${id}`,
        ),
        env,
      )
    ).status,
  ).toBe(404);
  await env.DB.prepare("DELETE FROM user_permissions WHERE user_id=?")
    .bind(owner.sub)
    .run();
  expect((await worker.fetch(request(`${url}/${id}`), env)).status).toBe(403);
  await env.DB.prepare(
    "INSERT INTO user_permissions(user_id,permission) VALUES(?,?)",
  )
    .bind(owner.sub, PERMISSIONS.readSharedOutcomes)
    .run();
  await runInRoomDO(room.roomId, async (instance, state) => {
    state.storage.sql.exec("UPDATE shared_outcome_state SET expires_at=0");
    await instance.alarm();
    expect(
      state.storage.sql.exec("SELECT * FROM progress_history").toArray(),
    ).toEqual([]);
    expect(
      state.storage.sql.exec("SELECT * FROM progress_history_outbox").toArray(),
    ).toEqual([]);
  });
  expect((await worker.fetch(request(`${url}/${id}`), env)).status).toBe(404);
  expect(
    await env.DB.prepare(
      "SELECT * FROM progress_history_snapshots WHERE room_id=?",
    )
      .bind(room.roomId)
      .all()
      .then((r) => r.results),
  ).toEqual([]);
});

it("投影処理中に期限を越しても時刻・本文を復活させない", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 1, step: 3 }, owner.sub);
    seed(state);
    state.storage.transactionSync(() =>
      recordProgressTransition(
        state.storage.sql,
        instance.getPhase(),
        null,
        "next",
      ),
    );
    const subject = instance as unknown as {
      writeProgressHistoryProjection(
        id: string,
        snapshot: string,
        expiry: number,
      ): Promise<void>;
    };
    const project = subject.writeProgressHistoryProjection.bind(subject);
    subject.writeProgressHistoryProjection = async (...args) => {
      await project(...args);
      state.storage.sql.exec("UPDATE shared_outcome_state SET expires_at=0");
    };
    await instance.alarm();
    expect(await instance.getProgressHistory()).toBeNull();
    expect(
      state.storage.sql.exec("SELECT * FROM progress_history_outbox").toArray(),
    ).toEqual([]);
    expect(
      await env.DB.prepare(
        "SELECT * FROM progress_history_snapshots WHERE room_id=?",
      )
        .bind(room.roomId)
        .all()
        .then((r) => r.results),
    ).toEqual([]);
  });
});

it("盤面outboxの書込だけ失敗した場合は欠落で進行し、WSで時刻保存失敗なら進行しない", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    seed(state);
    await instance.setPhase({ kind: "step", phase: 1, step: 3 }, owner.sub);
    state.storage.sql.exec(
      "CREATE TRIGGER reject_outbox BEFORE INSERT ON progress_history_outbox BEGIN SELECT RAISE(ABORT,'body unavailable'); END",
    );
  });
  const socket = await connectRoomAs(owner, room.roomId);
  const initial = await socket.next();
  if (initial.type !== "snapshot") throw new Error("snapshot required");
  socket.ws.send(
    JSON.stringify({
      type: "phase:next",
      expectedPhase: initial.phase,
      expectedRevision: initial.phaseRevision,
    }),
  );
  while ((await socket.next()).type !== "phase:updated") {}
  await runInRoomDO(room.roomId, async (instance, state) => {
    expect(instance.getPhase()).toEqual({ kind: "step", phase: 1, step: 4 });
    expect((await instance.getProgressHistory())?.entries[0].saveStatus).toBe(
      "missing",
    );
    state.storage.sql.exec(
      "CREATE TRIGGER reject_timestamps BEFORE UPDATE ON progress_history BEGIN SELECT RAISE(ABORT,'time unavailable'); END",
    );
  });
  const revision = await runInRoomDO(room.roomId, (_, state) =>
    getPhaseRevision(state.storage.sql),
  );
  socket.ws.send(
    JSON.stringify({
      type: "phase:next",
      expectedPhase: { kind: "step", phase: 1, step: 4 },
      expectedRevision: revision,
      force: true,
    }),
  );
  expect(await socket.next()).toMatchObject({ type: "error" });
  await runInRoomDO(room.roomId, async (instance) => {
    expect(instance.getPhase()).toEqual({ kind: "step", phase: 1, step: 4 });
    expect((await instance.getProgressHistory())?.entries).toHaveLength(2);
  });
  socket.close();
});

import { isResultStep, isVotingStep } from "../contracts/phase";
import { DOT_VOTE_LIMITS } from "../contracts/room-protocol";
import { addVoteSticker } from "./room/votes";

it.each([
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [2, 1],
  [2, 2],
  [2, 3],
  [2, 4],
  [3, 1],
  [3, 2],
  [3, 3],
  [3, 4],
])("全通常移行 %i-%i の移行直前盤面を記録する", async (phase, step) => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const current = { kind: "step", phase, step } as RoomPhase;
    await instance.setPhase(current, owner.sub);
    const id = seed(state, phase);
    if (isVotingStep(current))
      for (const kind of ["subjective", "objective"] as const)
        for (let i = 0; i < DOT_VOTE_LIMITS[kind]; i++)
          addVoteSticker(
            state.storage.sql,
            { id: crypto.randomUUID(), kind, x: 0.2, y: 0.2 },
            id,
            owner.sub,
          );
    if (isResultStep(current))
      state.storage.sql.exec(
        "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,'2026-09-27')",
        phase,
        id,
        "採用案",
        owner.sub,
      );
    await phaseHandlers["phase:next"](context(state), {
      type: "phase:next",
      expectedPhase: current,
      expectedRevision: getPhaseRevision(state.storage.sql),
    });
    state.storage.sql.exec("UPDATE pending_phase_transition SET deadline_at=0");
    await completeExpiredPhaseTransition(context(state));
    await instance.alarm();
    const rows = requireValue(await instance.getProgressHistory()).entries;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      phase: current,
      action: "next",
      saveStatus: "saved",
    });
    expect(
      (await instance.getProgressHistoryRecord(rows[0].id))?.snapshot?.phase,
    ).toEqual(current);
    expect(rows[1].enteredAt).toBe(rows[0].exitedAt);
  });
});

it("同一ルームのWSで開始から14ステップ完了まで訪問順の13盤面と終端参照を保つ", async () => {
  const room = await createRoomAs(owner);
  const socket = await connectRoomAs(owner, room.roomId);
  await socket.next();
  socket.ws.send(JSON.stringify({ type: "start_phase" }));
  expect(await socket.next()).toMatchObject({ type: "phase:updated" });
  for (let index = 0; index < 14; index++) {
    const current = await runInRoomDO(room.roomId, async (instance, state) => {
      const phase = instance.getPhase();
      if (phase.kind !== "step") throw new Error("step expected");
      const id = seed(state, phase.phase);
      if (isVotingStep(phase))
        for (const kind of ["subjective", "objective"] as const)
          for (let i = 0; i < DOT_VOTE_LIMITS[kind]; i++)
            addVoteSticker(
              state.storage.sql,
              { id: crypto.randomUUID(), kind, x: 0.2, y: 0.2 },
              id,
              owner.sub,
            );
      if (isResultStep(phase))
        state.storage.sql.exec(
          "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,'2026-09-27')",
          phase.phase,
          id,
          "確定した案",
          owner.sub,
        );
      return { phase, revision: getPhaseRevision(state.storage.sql) };
    });
    if (index === 13) {
      socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
      expect(await socket.next()).toMatchObject({ type: "outcome:published" });
      break;
    }
    socket.ws.send(
      JSON.stringify({
        type: "phase:next",
        expectedPhase: current.phase,
        expectedRevision: current.revision,
      }),
    );
    if (current.phase.step <= 2) {
      expect(await socket.next()).toMatchObject({
        type: "phase:save-requested",
      });
      await runInRoomDO(room.roomId, async (instance, state) => {
        state.storage.sql.exec(
          "UPDATE pending_phase_transition SET deadline_at=0",
        );
        await instance.alarm();
      });
    }
    while ((await socket.next()).type !== "phase:updated") {}
  }
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.alarm();
    const rows = requireValue(await instance.getProgressHistory()).entries;
    expect(rows).toHaveLength(14);
    expect(rows.map((e) => e.sequence)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1),
    );
    expect(rows.every((e) => e.enteredAt !== null && e.exitedAt !== null)).toBe(
      true,
    );
    expect(
      rows
        .slice(0, 13)
        .every((e) => e.action === "next" && e.saveStatus === "saved"),
    ).toBe(true);
    expect(rows[13].action).toBe("complete");
    expect(
      state.storage.sql
        .exec("SELECT COUNT(*) AS count FROM progress_history_outbox")
        .one().count,
    ).toBe(13);
  });
  socket.close();
});

it("古いoutboxだけ失敗しても次の盤面が先に反映され、古い記録は元の時刻と内容で復旧する", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    const phase: RoomPhase = { kind: "step", phase: 1, step: 3 };
    await instance.setPhase(phase, owner.sub);
    seed(state);
    state.storage.transactionSync(() =>
      recordProgressTransition(state.storage.sql, phase, phase, "next"),
    );
    state.storage.sql.exec("UPDATE notes SET content='次の記録'");
    state.storage.transactionSync(() =>
      recordProgressTransition(state.storage.sql, phase, phase, "next"),
    );
    const rows = requireValue(await instance.getProgressHistory()).entries;
    const subject = instance as unknown as {
      writeProgressHistoryProjection(
        id: string,
        snapshot: string,
        expiry: number,
      ): Promise<void>;
    };
    const project = subject.writeProgressHistoryProjection.bind(subject);
    subject.writeProgressHistoryProjection = async (id, ...args) => {
      if (id === rows[0].id) throw new Error("old only");
      await project(id, ...args);
    };
    await instance.alarm();
    expect(
      (await instance.getProgressHistoryRecord(rows[0].id))?.saveStatus,
    ).toBe("failed");
    expect(
      (await instance.getProgressHistoryRecord(rows[1].id))?.snapshot?.notes[0]
        .content,
    ).toBe("次の記録");
    subject.writeProgressHistoryProjection = project;
    await instance.alarm();
    const recovered = await instance.getProgressHistoryRecord(rows[0].id);
    expect(recovered?.exitedAt).toBe(rows[0].exitedAt);
    expect(recovered?.snapshot?.notes[0].content).toBe("変更前の共有本文");
  });
});

function requireValue<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected value");
  return value;
}

it("導入前に成果公開済みのルームは再表示で完了記録を推測追加しない", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 3, step: 5 }, owner.sub);
    const id = seed(state, 3);
    state.storage.sql.exec(
      "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(3,?,?,?,'2026-09-27')",
      id,
      "以前の採用案",
      owner.sub,
    );
    state.storage.sql.exec("UPDATE room_state SET outcome_published=1");
  });
  const socket = await connectRoomAs(owner, room.roomId);
  await socket.next();
  socket.ws.send(JSON.stringify({ type: "outcome:publish" }));
  expect(await socket.next()).toMatchObject({ type: "outcome:published" });
  expect(
    await runInRoomDO(room.roomId, (instance) => instance.getProgressHistory()),
  ).toEqual({ entries: [], nextCursor: null });
  socket.close();
});

it("期限を過ぎてから参加者が操作を再開しても、削除前の古い履歴を延命しない", async () => {
  const room = await createRoomAs(owner);
  await runInRoomDO(room.roomId, async (instance, state) => {
    await instance.setPhase({ kind: "step", phase: 1, step: 3 }, owner.sub);
    seed(state);
    state.storage.transactionSync(() =>
      recordProgressTransition(
        state.storage.sql,
        instance.getPhase(),
        null,
        "next",
      ),
    );
    await instance.alarm();
  });
  const socket = await connectRoomAs(owner, room.roomId);
  await socket.next();
  await runInRoomDO(room.roomId, (_, state) => {
    state.storage.sql.exec("UPDATE shared_outcome_state SET expires_at=0");
  });
  socket.ws.send(JSON.stringify({ type: "timer:start", durationMs: 60000 }));
  expect(await socket.next()).toMatchObject({ type: "timer:updated" });
  const data = await runInRoomDO(room.roomId, (instance) =>
    instance.getProgressHistory(),
  );
  expect(data?.entries).toEqual([]);
  expect(
    await env.DB.prepare(
      "SELECT * FROM progress_history_snapshots WHERE room_id=?",
    )
      .bind(room.roomId)
      .all()
      .then((r) => r.results),
  ).toEqual([]);
  socket.close();
});
