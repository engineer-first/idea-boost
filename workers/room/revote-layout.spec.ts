import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  endTimerForTest,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  startTimerForTest,
} from "../test-helpers";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "Host",
  email: "host@test.example",
};
const member = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "Member",
  email: "member@test.example",
};

const sockets: RoomSocket[] = [];
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close();
});

async function setupAtResultStep(phase: 1 | 2 | 3) {
  const { roomId, inviteCode } = await createRoomAs(host);
  await joinRoomAs(member, inviteCode);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId));
  const resultStep = phase === 2 ? 4 : 5;
  await stub.setPhase({ kind: "step", phase, step: resultStep }, host.sub);
  const a = await connectRoomAs(host, roomId);
  sockets.push(a);
  await a.next();
  const b = await connectRoomAs(member, roomId);
  sockets.push(b);
  await b.next();
  return { roomId, stub, a, b };
}

describe("1-5→1-4 再投票時のグループレイアウト自動調整", () => {
  it("1-5からphase:revoteを実行すると、所属を変えずに枠の重なりを解消して1-4へ移行し全員へ同期する", async () => {
    const { roomId, a, b } = await setupAtResultStep(1);
    const ids = {
      a1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      a2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      a3: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      b1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      b2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
      solo: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      gA: "11111111-aaaa-4aaa-8aaa-111111111111",
      gB: "22222222-bbbb-4bbb-8bbb-222222222222",
    };

    await runInRoomDO(roomId, (_room, state) => {
      const now = "2026-11-25T00:00:00.000Z";
      const insertNote = (
        id: string,
        x: number,
        y: number,
        color: string,
        excluded: number,
      ) => {
        state.storage.sql.exec(
          `INSERT INTO notes (id, author_id, content, visibility, color, x, y, stack_order, created_at, updated_at, phase, excluded)
           VALUES (?1, ?2, ?3, 'shared', ?4, ?5, ?6, 1, ?7, ?7, 1, ?8)`,
          id,
          host.sub,
          `課題 ${id.slice(-1)}`,
          color,
          x,
          y,
          now,
          excluded,
        );
      };
      // a3 が右へ飛び出して B 枠を越えており、solo が A 枠内に入っている
      insertNote(ids.a1, 0, 0, "yellow", 0);
      insertNote(ids.a2, 220, 0, "blue", 1); // 除外済みが混在
      insertNote(ids.a3, 1000, 0, "yellow", 0);
      insertNote(ids.b1, 520, 0, "pink", 0);
      insertNote(ids.b2, 740, 0, "green", 0);
      insertNote(ids.solo, 110, 20, "yellow", 0);

      state.storage.sql.exec(
        "INSERT INTO groups (id, name, note_ids, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        ids.gA,
        "グループ A",
        JSON.stringify([ids.a1, ids.a2, ids.a3]),
        now,
      );
      state.storage.sql.exec(
        "INSERT INTO groups (id, name, note_ids, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        ids.gB,
        "グループ B",
        JSON.stringify([ids.b1, ids.b2]),
        now,
      );
      state.storage.sql.exec(
        "INSERT INTO note_votes (note_id, user_id, kind, created_at) VALUES (?1, ?2, 'subjective', ?3)",
        ids.a1,
        host.sub,
        now,
      );
    });

    const expected = await currentPhaseExpectation(roomId);
    a.ws.send(JSON.stringify({ type: "phase:revote", ...expected }));

    const snapshotA = await a.next();
    const updatedA = await a.next();
    const snapshotB = await b.next();
    expect(updatedA).toMatchObject({
      type: "phase:updated",
      phase: { kind: "step", phase: 1, step: 4 },
    });
    expect(snapshotA.type).toBe("snapshot");
    expect(snapshotB.type).toBe("snapshot");
    if (snapshotA.type !== "snapshot" || snapshotB.type !== "snapshot") return;

    // 所属・除外状態・色が保持され、票は消えている
    expect(snapshotA.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ids.gA,
          noteIds: [ids.a1, ids.a2, ids.a3],
        }),
        expect.objectContaining({
          id: ids.gB,
          noteIds: [ids.b1, ids.b2],
        }),
      ]),
    );
    const noteA2 = snapshotA.notes.find((n) => n.id === ids.a2);
    expect(noteA2).toMatchObject({ excluded: true, color: "blue" });
    const noteA1 = snapshotA.notes.find((n) => n.id === ids.a1);
    const remainingVotes = await runInRoomDO(roomId, (_room, state) => {
      return Number(
        state.storage.sql
          .exec("SELECT COUNT(*) AS count FROM note_votes")
          .one().count,
      );
    });
    expect(remainingVotes).toBe(0);

    // a3 と solo が調整され、a1, a2, b1, b2 は動いていない & 両者に同じ座標が同期されている
    const noteA3A = snapshotA.notes.find((n) => n.id === ids.a3)!;
    const noteA3B = snapshotB.notes.find((n) => n.id === ids.a3)!;
    const noteSoloA = snapshotA.notes.find((n) => n.id === ids.solo)!;
    expect(noteA3A.x).not.toBe(1000);
    expect(noteA3A.x).toBe(noteA3B.x);
    expect(noteA3A.y).toBe(noteA3B.y);
    expect(noteSoloA.x === 110 && noteSoloA.y === 20).toBe(false);
    expect(noteA1?.x).toBe(0);
    expect(noteA1?.y).toBe(0);

    // 1-5離脱時の節目記録(progress_history_outbox)には整理前の1-5座標が残っている
    const recorded15Snapshot = await runInRoomDO(roomId, (_room, state) => {
      const row = state.storage.sql
        .exec(
          `SELECT o.snapshot_json
           FROM progress_history_outbox o
           JOIN progress_history h ON h.id = o.record_id
           WHERE h.action = 'revote'
           ORDER BY h.sequence DESC LIMIT 1`,
        )
        .toArray()[0];
      return row ? JSON.parse(row.snapshot_json as string) : null;
    });
    expect(recorded15Snapshot).not.toBeNull();
    const beforeA3 = recorded15Snapshot.notes.find(
      (n: { id: string }) => n.id === ids.a3,
    );
    expect(beforeA3?.x).toBe(1000);
  });

  it("重なりがない盤面で1-5からphase:revoteを実行しても座標は1pxも変わらない", async () => {
    const { roomId, a } = await setupAtResultStep(1);
    const ids = {
      a1: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      a2: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
      b1: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      b2: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
      gA: "33333333-aaaa-4aaa-8aaa-333333333333",
      gB: "44444444-bbbb-4bbb-8bbb-444444444444",
    };

    await runInRoomDO(roomId, (_room, state) => {
      const now = "2026-11-25T00:00:00.000Z";
      for (const [id, x, y] of [
        [ids.a1, 0, 0],
        [ids.a2, 220, 0],
        [ids.b1, 700, 0],
        [ids.b2, 920, 0],
      ] as const) {
        state.storage.sql.exec(
          `INSERT INTO notes (id, author_id, content, visibility, color, x, y, stack_order, created_at, updated_at, phase, excluded)
           VALUES (?1, ?2, '課題', 'shared', 'yellow', ?3, ?4, 1, ?5, ?5, 1, 0)`,
          id,
          host.sub,
          x,
          y,
          now,
        );
      }
      state.storage.sql.exec(
        "INSERT INTO groups (id, name, note_ids, created_at, updated_at) VALUES (?1, 'グループ A', ?2, ?3, ?3)",
        ids.gA,
        JSON.stringify([ids.a1, ids.a2]),
        now,
      );
      state.storage.sql.exec(
        "INSERT INTO groups (id, name, note_ids, created_at, updated_at) VALUES (?1, 'グループ B', ?2, ?3, ?3)",
        ids.gB,
        JSON.stringify([ids.b1, ids.b2]),
        now,
      );
    });

    const expected = await currentPhaseExpectation(roomId);
    a.ws.send(JSON.stringify({ type: "phase:revote", ...expected }));

    const snapshot = await a.next();
    await a.next();
    if (snapshot.type !== "snapshot") throw new Error("expected snapshot");
    expect(snapshot.notes.find((n) => n.id === ids.a1)).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(snapshot.notes.find((n) => n.id === ids.b1)).toMatchObject({
      x: 700,
      y: 0,
    });
  });

  it("フェーズ3の3-5からphase:revoteを実行しても座標は変わらない", async () => {
    const { roomId, a } = await setupAtResultStep(3);
    const id1 = "ffffffff-ffff-4fff-8fff-fffffffffff1";
    await runInRoomDO(roomId, (_room, state) => {
      const now = "2026-11-25T00:00:00.000Z";
      state.storage.sql.exec(
        `INSERT INTO notes (id, author_id, content, visibility, color, x, y, stack_order, created_at, updated_at, phase, excluded)
         VALUES (?1, ?2, 'アイデア', 'shared', 'yellow', 100, 120, 1, ?3, ?3, 3, 0)`,
        id1,
        host.sub,
        now,
      );
    });

    const expected = await currentPhaseExpectation(roomId);
    a.ws.send(JSON.stringify({ type: "phase:revote", ...expected }));
    const snapshot = await a.next();
    await a.next();
    if (snapshot.type !== "snapshot") throw new Error("expected snapshot");
    expect(snapshot.notes.find((n) => n.id === id1)).toMatchObject({
      x: 100,
      y: 120,
    });
  });
});
