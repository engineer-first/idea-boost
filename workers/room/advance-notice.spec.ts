import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { RoomPhase } from "../../contracts/phase";
import {
  ADVANCE_NOTICE_MS,
  ADVANCE_NOTICE_TIMEOUT_MS,
  type ServerMessage,
} from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  currentPhaseExpectation,
  elapseAdvanceNoticeForTest,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  startTimerForTest,
} from "../test-helpers";
import { getPhase } from "./phase";
import { getTimerState, saveTimerState } from "./timer";

const host = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "ホスト",
  email: "host@example.test",
};
const member = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "参加者",
  email: "member@example.test",
};

// このファイルは予告そのものを検証するので、受信列に予告を入れる。
const DELIVER = { notices: "deliver" } as const;

const step = (phase: 1 | 2 | 3, s: number): RoomPhase =>
  ({ kind: "step", phase, step: s }) as RoomPhase;

async function setup(phase: RoomPhase = step(1, 1)): Promise<string> {
  const room = await createRoomAs(host);
  await joinRoomAs(member, room.inviteCode);
  await env.ROOM_DO.get(env.ROOM_DO.idFromName(room.roomId)).setPhase(
    phase,
    host.sub,
  );
  await startTimerForTest(room.roomId);
  return room.roomId;
}

async function connectBoth(roomId: string): Promise<[RoomSocket, RoomSocket]> {
  const a = await connectRoomAs(host, roomId, DELIVER);
  await a.next();
  const b = await connectRoomAs(member, roomId, DELIVER);
  await b.next();
  return [a, b];
}

async function untilType<T extends ServerMessage["type"]>(
  socket: RoomSocket,
  type: T,
): Promise<Extract<ServerMessage, { type: T }>> {
  for (let i = 0; i < 40; i++) {
    const message = await socket.next();
    if (message.type === type)
      return message as Extract<ServerMessage, { type: T }>;
  }
  throw new Error(`応答 ${type} が見つかりません`);
}

function phaseOf(roomId: string): Promise<RoomPhase> {
  return runInRoomDO(roomId, (_room, state) => getPhase(state.storage.sql));
}

function noticeRows(roomId: string): Promise<Record<string, unknown>[]> {
  return runInRoomDO(roomId, (_room, state) =>
    state.storage.sql.exec("SELECT * FROM advance_notice").toArray(),
  );
}

async function sendNext(socket: RoomSocket, roomId: string): Promise<void> {
  socket.ws.send(
    JSON.stringify({
      type: "phase:next",
      ...(await currentPhaseExpectation(roomId)),
    }),
  );
}

// 投票対象の付箋を1枚置き、指定した人の票を上限の手前まで（remaining 票を残して）入れる。
async function arrangeVotes(
  roomId: string,
  remainingByUser: Record<string, number>,
): Promise<string> {
  const noteId = crypto.randomUUID();
  await runInRoomDO(roomId, (_room, state) => {
    const sql = state.storage.sql;
    sql.exec(
      "INSERT INTO notes(id,author_id,content,visibility,color,x,y,phase,created_at,updated_at) VALUES(?,?,'投票対象','shared','yellow',0,0,1,'now','now')",
      noteId,
      host.sub,
    );
    for (const [userId, remaining] of Object.entries(remainingByUser)) {
      sql.exec(
        "INSERT INTO note_vote_stickers(id,note_id,user_id,kind,x,y,created_at) VALUES(?,?,?,'subjective',0.2,0.3,'now')",
        crypto.randomUUID(),
        noteId,
        userId,
      );
      for (let i = 0; i < 3 - remaining; i++)
        sql.exec(
          "INSERT INTO note_vote_stickers(id,note_id,user_id,kind,x,y,created_at) VALUES(?,?,?,'objective',0.2,0.3,'now')",
          crypto.randomUUID(),
          noteId,
          userId,
        );
    }
  });
  return noteId;
}

describe("次のステップへ進む前の予告", () => {
  it("接続中が2人のとき phase:next は工程を進めず、押した人と5秒の終了時刻を持つ予告を全員へ配る", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await sendNext(a, roomId);
      for (const socket of [a, b]) {
        const message = await untilType(socket, "phase:notice");
        expect(message.notice).toMatchObject({
          trigger: "member",
          initiatorUserId: host.sub,
          durationMs: ADVANCE_NOTICE_MS,
        });
        expect(message.notice?.endsAt).toBe(
          message.serverNow + ADVANCE_NOTICE_MS,
        );
      }
      expect(await phaseOf(roomId)).toEqual(step(1, 1));
    } finally {
      a.close();
      b.close();
    }
  });

  it("予告の時間が過ぎると次の工程へ進み、進行の記録は確定した時だけ残る", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    const countHistory = () =>
      runInRoomDO(roomId, (_room, state) =>
        Number(
          state.storage.sql
            .exec("SELECT COUNT(*) AS count FROM progress_history")
            .one().count,
        ),
      );
    try {
      const before = await countHistory();
      await sendNext(a, roomId);
      await untilType(b, "phase:notice");
      expect(await countHistory()).toBe(before);
      await elapseAdvanceNoticeForTest(roomId);
      expect((await untilType(b, "phase:updated")).phase).toEqual(step(1, 2));
      expect(await countHistory()).toBeGreaterThan(before);
      expect(await noticeRows(roomId)).toEqual([]);
    } finally {
      a.close();
      b.close();
    }
  });

  it("押した人以外の phase:hold は予告を取り消し、止めた人の userId を誰にも配らない", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    const raw: string[] = [];
    a.ws.addEventListener("message", (event) => raw.push(String(event.data)));
    try {
      await sendNext(a, roomId);
      const started = await untilType(b, "phase:notice");
      await untilType(a, "phase:notice");
      b.ws.send(
        JSON.stringify({
          type: "phase:hold",
          noticeId: started.notice?.noticeId,
        }),
      );
      for (const socket of [a, b])
        expect(await untilType(socket, "phase:notice")).toMatchObject({
          notice: null,
          reason: "held",
        });
      const cancelled = raw.filter(
        (data) => data.includes('"phase:notice"') && data.includes('"held"'),
      );
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0]).not.toContain(member.sub);
      await elapseAdvanceNoticeForTest(roomId);
      expect(await phaseOf(roomId)).toEqual(step(1, 1));
    } finally {
      a.close();
      b.close();
    }
  });

  it("押した本人の phase:hold は withdrawn として取り消す", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await sendNext(a, roomId);
      const started = await untilType(a, "phase:notice");
      a.ws.send(
        JSON.stringify({
          type: "phase:hold",
          noticeId: started.notice?.noticeId,
        }),
      );
      await untilType(b, "phase:notice");
      expect(await untilType(b, "phase:notice")).toMatchObject({
        notice: null,
        reason: "withdrawn",
      });
    } finally {
      a.close();
      b.close();
    }
  });

  it("進行中の予告と違う noticeId の phase:hold は拒否し、予告を続ける", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await sendNext(a, roomId);
      await untilType(b, "phase:notice");
      b.ws.send(
        JSON.stringify({ type: "phase:hold", noticeId: crypto.randomUUID() }),
      );
      expect(await untilType(b, "error")).toMatchObject({ code: "forbidden" });
      expect(await noticeRows(roomId)).toHaveLength(1);
    } finally {
      a.close();
      b.close();
    }
  });

  it("予告中の2回目の phase:next は終了時刻を延ばさない", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await sendNext(a, roomId);
      await untilType(b, "phase:notice");
      const [first] = await noticeRows(roomId);
      await sendNext(b, roomId);
      // 2回目が処理された後の状態を、後続の応答（タイマー拒否）で待ち合わせる。
      b.ws.send(JSON.stringify({ type: "timer:pause" }));
      await untilType(b, "error");
      expect(await noticeRows(roomId)).toEqual([first]);
    } finally {
      a.close();
      b.close();
    }
  });

  it("接続中が1人のとき phase:next は予告なしで次の工程へ進む", async () => {
    const roomId = await setup();
    const a = await connectRoomAs(host, roomId, DELIVER);
    try {
      await a.next();
      await sendNext(a, roomId);
      let message = await a.next();
      while (message.type !== "phase:updated") {
        expect(message.type).not.toBe("phase:notice");
        message = await a.next();
      }
      expect(message.phase).toEqual(step(1, 2));
    } finally {
      a.close();
    }
  });

  it("再接続した人の snapshot に進行中の予告を含める", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await sendNext(a, roomId);
      const started = await untilType(a, "phase:notice");
      const c = await connectRoomAs(member, roomId, DELIVER);
      try {
        expect(await c.next()).toMatchObject({
          type: "snapshot",
          advanceNotice: { noticeId: started.notice?.noticeId },
        });
      } finally {
        c.close();
      }
    } finally {
      a.close();
      b.close();
    }
  });

  it("予告中に直前のステップへ戻すと予告を消し、時間が過ぎても進めない", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      // 1-1 → 1-2 へ進めて、戻り先を作る。
      await sendNext(a, roomId);
      await untilType(a, "phase:notice");
      await elapseAdvanceNoticeForTest(roomId);
      await untilType(a, "phase:updated");
      await untilType(b, "phase:updated");
      await runInRoomDO(roomId, (_room, state) => {
        state.storage.sql.exec(
          "INSERT INTO advance_notice(id,notice_id,phase_revision,cause,initiator_user_id,ends_at,duration_ms) VALUES(1,?,(SELECT phase_revision FROM room_state WHERE id=1),'member',?,?,5000)",
          crypto.randomUUID(),
          host.sub,
          Date.now() + 5000,
        );
      });
      b.ws.send(
        JSON.stringify({
          type: "phase:rollback",
          ...(await currentPhaseExpectation(roomId)),
        }),
      );
      // 戻した後は snapshot だけを配り直す。予告は含まれない。
      expect(await untilType(b, "snapshot")).toMatchObject({
        phase: step(1, 1),
        advanceNotice: null,
      });
      expect(await noticeRows(roomId)).toEqual([]);
      await elapseAdvanceNoticeForTest(roomId);
      expect(await phaseOf(roomId)).toEqual(step(1, 1));
    } finally {
      a.close();
      b.close();
    }
  });

  it("予告中に接続中の全員が切断すると予告を止め、工程を進めない", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    await sendNext(a, roomId);
    await untilType(b, "phase:notice");
    a.close();
    b.close();
    await expect.poll(() => noticeRows(roomId), { timeout: 3000 }).toEqual([]);
    await elapseAdvanceNoticeForTest(roomId);
    expect(await phaseOf(roomId)).toEqual(step(1, 1));
  });

  it("phase:ready を受け取っても状態を変えず、エラーも返さない", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      a.ws.send(
        JSON.stringify({
          type: "phase:ready",
          ...(await currentPhaseExpectation(roomId)),
          ready: true,
        }),
      );
      a.ws.send(JSON.stringify({ type: "timer:pause" }));
      // 先に送った phase:ready がエラーを返していれば、ここで code が一致しない。
      expect(await untilType(a, "error")).toMatchObject({
        message: "この状態ではその操作はできません。",
      });
      expect(
        await runInRoomDO(roomId, (_room, state) =>
          state.storage.sql
            .exec("SELECT * FROM phase_progress_ready")
            .toArray(),
        ),
      ).toEqual([]);
    } finally {
      a.close();
      b.close();
    }
  });
});

describe("投票がそろった時の予告", () => {
  it("最後の1票で全員が票を使い切ると、押した人のいない votes の予告を自動で出す", async () => {
    const roomId = await setup(step(1, 4));
    const noteId = await arrangeVotes(roomId, {
      [host.sub]: 0,
      [member.sub]: 1,
    });
    const [a, b] = await connectBoth(roomId);
    try {
      b.ws.send(
        JSON.stringify({ type: "note:vote", noteId, kind: "objective" }),
      );
      expect((await untilType(a, "phase:notice")).notice).toMatchObject({
        trigger: "votes",
        initiatorUserId: null,
        durationMs: ADVANCE_NOTICE_MS,
      });
      await elapseAdvanceNoticeForTest(roomId);
      expect((await untilType(a, "phase:updated")).phase).toEqual(step(1, 5));
    } finally {
      a.close();
      b.close();
    }
  });

  it("票が残っている人がいる間の phase:next は拒否し、予告を出さない", async () => {
    const roomId = await setup(step(1, 4));
    await arrangeVotes(roomId, { [host.sub]: 0, [member.sub]: 1 });
    const [a, b] = await connectBoth(roomId);
    try {
      await sendNext(a, roomId);
      expect(await untilType(a, "error")).toMatchObject({ code: "forbidden" });
      expect(await noticeRows(roomId)).toEqual([]);
    } finally {
      a.close();
      b.close();
    }
  });

  it("予告中に票を外すと unmet で取り消し、入れ直すともう一度予告を出す", async () => {
    const roomId = await setup(step(1, 4));
    const noteId = await arrangeVotes(roomId, {
      [host.sub]: 0,
      [member.sub]: 1,
    });
    const [a, b] = await connectBoth(roomId);
    try {
      b.ws.send(
        JSON.stringify({ type: "note:vote", noteId, kind: "objective" }),
      );
      await untilType(a, "phase:notice");
      b.ws.send(
        JSON.stringify({ type: "note:vote-remove", noteId, kind: "objective" }),
      );
      expect(await untilType(a, "phase:notice")).toMatchObject({
        notice: null,
        reason: "unmet",
      });
      b.ws.send(
        JSON.stringify({ type: "note:vote", noteId, kind: "objective" }),
      );
      expect((await untilType(a, "phase:notice")).notice).toMatchObject({
        trigger: "votes",
      });
    } finally {
      a.close();
      b.close();
    }
  });

  it("votes の予告を止めた工程では、票がそろい直しても自動で出さず、phase:next で予告を出せる", async () => {
    const roomId = await setup(step(1, 4));
    const noteId = await arrangeVotes(roomId, {
      [host.sub]: 0,
      [member.sub]: 1,
    });
    const [a, b] = await connectBoth(roomId);
    try {
      b.ws.send(
        JSON.stringify({ type: "note:vote", noteId, kind: "objective" }),
      );
      const started = await untilType(a, "phase:notice");
      a.ws.send(
        JSON.stringify({
          type: "phase:hold",
          noticeId: started.notice?.noticeId,
        }),
      );
      expect(await untilType(a, "phase:notice")).toMatchObject({
        notice: null,
        reason: "held",
      });
      b.ws.send(
        JSON.stringify({ type: "note:vote-remove", noteId, kind: "objective" }),
      );
      b.ws.send(
        JSON.stringify({ type: "note:vote", noteId, kind: "objective" }),
      );
      // 2つの投票が処理された後の状態を、後続の応答で待ち合わせる。
      b.ws.send(JSON.stringify({ type: "timer:pause" }));
      await untilType(b, "error");
      expect(await noticeRows(roomId)).toEqual([]);
      await sendNext(a, roomId);
      expect((await untilType(b, "phase:notice")).notice).toMatchObject({
        trigger: "member",
        initiatorUserId: host.sub,
      });
    } finally {
      a.close();
      b.close();
    }
  });

  it("接続中が1人のときは、票を使い切った時点で予告なしで結果へ進む", async () => {
    const roomId = await setup(step(1, 4));
    const noteId = await arrangeVotes(roomId, { [host.sub]: 1 });
    const a = await connectRoomAs(host, roomId, DELIVER);
    try {
      await a.next();
      a.ws.send(
        JSON.stringify({ type: "note:vote", noteId, kind: "objective" }),
      );
      let message = await a.next();
      while (message.type !== "phase:updated") {
        expect(message.type).not.toBe("phase:notice");
        message = await a.next();
      }
      expect(message.phase).toEqual(step(1, 5));
    } finally {
      a.close();
    }
  });

  it("票を使い切った人だけが残る切断では、自動の予告も進行も起こさない", async () => {
    const roomId = await setup(step(1, 4));
    await arrangeVotes(roomId, { [host.sub]: 0, [member.sub]: 1 });
    const [a, b] = await connectBoth(roomId);
    try {
      b.close();
      await expect
        .poll(
          () =>
            runInRoomDO(roomId, (_room, state) =>
              JSON.parse(
                String(
                  state.storage.sql
                    .exec(
                      "SELECT progress_connected_user_ids AS ids FROM room_state WHERE id=1",
                    )
                    .one().ids,
                ),
              ),
            ),
          { timeout: 3000 },
        )
        .toEqual([host.sub]);
      expect(await noticeRows(roomId)).toEqual([]);
      expect(await phaseOf(roomId)).toEqual(step(1, 4));
    } finally {
      a.close();
    }
  });
});

describe("時間切れの予告", () => {
  async function expireTimer(roomId: string, extensionUsed = false) {
    await runInRoomDO(roomId, async (room, state) => {
      saveTimerState(state.storage.sql, {
        status: "running",
        endsAt: Date.now() - 1,
        durationMs: 60_000,
        ...(extensionUsed ? { extensionUsed: true } : {}),
      });
      await room.alarm();
    });
  }

  it("最初の時間切れで timer の10秒の予告を出し、時間が過ぎると次の工程へ進む", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await expireTimer(roomId);
      const started = await untilType(a, "phase:notice");
      expect(started.notice).toMatchObject({
        trigger: "timer",
        initiatorUserId: null,
        durationMs: ADVANCE_NOTICE_TIMEOUT_MS,
      });
      expect(await phaseOf(roomId)).toEqual(step(1, 1));
      await elapseAdvanceNoticeForTest(roomId);
      expect((await untilType(a, "phase:updated")).phase).toEqual(step(1, 2));
    } finally {
      a.close();
      b.close();
    }
  });

  it("timer の予告中の timer:extend は extended で予告を取り消し、1分の計時を始める", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await expireTimer(roomId);
      await untilType(b, "phase:notice");
      a.ws.send(JSON.stringify({ type: "timer:extend" }));
      expect(await untilType(b, "phase:notice")).toMatchObject({
        notice: null,
        reason: "extended",
      });
      expect(
        await runInRoomDO(roomId, (_room, state) =>
          getTimerState(state.storage.sql),
        ),
      ).toMatchObject({ status: "running", extensionUsed: true });
      await elapseAdvanceNoticeForTest(roomId);
      expect(await phaseOf(roomId)).toEqual(step(1, 1));
    } finally {
      a.close();
      b.close();
    }
  });

  it("timer の予告は phase:hold で止められない", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await expireTimer(roomId);
      const started = await untilType(b, "phase:notice");
      b.ws.send(
        JSON.stringify({
          type: "phase:hold",
          noticeId: started.notice?.noticeId,
        }),
      );
      expect(await untilType(b, "error")).toMatchObject({ code: "forbidden" });
      expect(await noticeRows(roomId)).toHaveLength(1);
    } finally {
      a.close();
      b.close();
    }
  });

  it("延長した1分が終わると予告を出し、延長も取り消しもできずに次の工程へ進む", async () => {
    const roomId = await setup();
    const [a, b] = await connectBoth(roomId);
    try {
      await expireTimer(roomId, true);
      await untilType(a, "phase:notice");
      a.ws.send(JSON.stringify({ type: "timer:extend" }));
      expect(await untilType(a, "error")).toMatchObject({ code: "forbidden" });
      expect(await noticeRows(roomId)).toHaveLength(1);
      await elapseAdvanceNoticeForTest(roomId);
      expect((await untilType(a, "phase:updated")).phase).toEqual(step(1, 2));
    } finally {
      a.close();
      b.close();
    }
  });

  it("接続中が1人でも時間切れの予告を出す", async () => {
    const roomId = await setup();
    const a = await connectRoomAs(host, roomId, DELIVER);
    try {
      await a.next();
      await expireTimer(roomId);
      expect((await untilType(a, "phase:notice")).notice).toMatchObject({
        trigger: "timer",
      });
      expect(await phaseOf(roomId)).toEqual(step(1, 1));
    } finally {
      a.close();
    }
  });

  it("時間切れの時に票が残っていれば予告を出さず、そろった時点で出す", async () => {
    const roomId = await setup(step(1, 4));
    const noteId = await arrangeVotes(roomId, {
      [host.sub]: 0,
      [member.sub]: 1,
    });
    const [a, b] = await connectBoth(roomId);
    try {
      await expireTimer(roomId);
      expect(await noticeRows(roomId)).toEqual([]);
      b.ws.send(
        JSON.stringify({ type: "note:vote", noteId, kind: "objective" }),
      );
      expect((await untilType(a, "phase:notice")).notice).not.toBeNull();
    } finally {
      a.close();
      b.close();
    }
  });

  it("接続中の人がいない間の時間切れでは予告を出さず、誰かが接続した時に出す", async () => {
    const roomId = await setup();
    await expireTimer(roomId);
    expect(await noticeRows(roomId)).toEqual([]);
    const a = await connectRoomAs(host, roomId, DELIVER);
    try {
      await a.next();
      expect((await untilType(a, "phase:notice")).notice).toMatchObject({
        trigger: "timer",
      });
    } finally {
      a.close();
    }
  });

  it("共有（1-2）の時間切れでは工程を進める予告を出さない", async () => {
    const roomId = await setup(step(1, 2));
    const [a, b] = await connectBoth(roomId);
    try {
      await runInRoomDO(roomId, async (room, state) => {
        state.storage.sql.exec("DELETE FROM sharing_state");
        saveTimerState(state.storage.sql, {
          status: "running",
          endsAt: Date.now() - 1,
          durationMs: 60_000,
        });
        await room.alarm();
      });
      expect(await noticeRows(roomId)).toEqual([]);
    } finally {
      a.close();
      b.close();
    }
  });
});

describe("最終ステップ（3-5）の成果の公開", () => {
  it("採用が決まっていれば、タイマーが動作中でも outcome:publish を受理する", async () => {
    const roomId = await setup(step(3, 5));
    await runInRoomDO(roomId, (_room, state) => {
      for (const phase of [1, 2, 3])
        state.storage.sql.exec(
          "INSERT INTO decisions(phase,note_id,note_content,decided_by,decided_at) VALUES(?,?,?,?,?)",
          phase,
          crypto.randomUUID(),
          `決定${phase}`,
          host.sub,
          new Date().toISOString(),
        );
    });
    const [a, b] = await connectBoth(roomId);
    try {
      b.ws.send(JSON.stringify({ type: "outcome:publish" }));
      expect(await untilType(a, "outcome:published")).toMatchObject({
        published: true,
      });
      expect(await noticeRows(roomId)).toEqual([]);
    } finally {
      a.close();
      b.close();
    }
  });
});
