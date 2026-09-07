// RoomDO 単体の契約テスト。
// メンバーシップの真実（upsert の冪等性・isMember 判定・name の保持・進行状態）と、
// api-worker を経由しない到達への深層防御を検証する。
// Realtime 配信（新規メンバーの member_joined broadcast）は
// room-protocol.spec.ts の E2E テスト（実 WS 接続）で検証する。
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { buildLobbyPhase, buildPhaseStep } from "../../contracts/phase.fixture";
import {
  NOTE_COLOR_PALETTE,
  TIMER_MAX_DURATION_MS,
} from "../../contracts/room-protocol";
import { listMemberIds, runInRoomDO } from "../test-helpers";
import { HOST_ID_HEADER, USER_ID_HEADER } from "./room-do";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const NOTE_COLOR_PATTERN = new RegExp(`^(${NOTE_COLOR_PALETTE.join("|")})$`);
const LOBBY = buildLobbyPhase();

function userIdAt(index: number): string {
  return `${index.toString().padStart(8, "0")}-0000-4000-8000-000000000000`;
}

function roomStub(name: string) {
  return env.ROOM_DO.get(env.ROOM_DO.idFromName(name));
}

async function connectDirectly(
  roomName: string,
  userId: string,
  hostId: string,
): Promise<WebSocket> {
  const res = await roomStub(roomName).fetch("https://do/ws", {
    headers: {
      Upgrade: "websocket",
      [USER_ID_HEADER]: userId,
      [HOST_ID_HEADER]: hostId,
    },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
  ws.accept();
  await new Promise<MessageEvent>((resolve) => {
    ws.addEventListener("message", resolve, { once: true });
  });
  return ws;
}

function nextJson(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.addEventListener(
      "message",
      (event) => resolve(JSON.parse(String(event.data))),
      { once: true },
    );
  });
}

function nextJsonWithin(
  ws: WebSocket,
  timeoutMs = 500,
): Promise<Record<string, unknown> | undefined> {
  return Promise.race([
    nextJson(ws),
    new Promise<undefined>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

describe("RoomDO メンバーシップ", () => {
  it("upsertMember は冪等（複数回呼んでもメンバーは1件のまま）", async () => {
    const stub = roomStub("room-idempotent");
    await stub.upsertMember(USER_A, "Alpha");
    await stub.upsertMember(USER_A, "Alpha");
    await stub.upsertMember(USER_A, "Alpha");
    expect(await listMemberIds("room-idempotent")).toEqual([USER_A]);
  });

  it("upsertMember は冪等で name を最新に同期する", async () => {
    const stub = roomStub("room-upsert-name");
    await stub.upsertMember(USER_A, "古い名前");
    await stub.upsertMember(USER_A, "新しい名前");
    await stub.upsertMember(USER_A, "新しい名前");
    const members = await stub.listMembers();
    expect(members).toEqual([
      {
        userId: USER_A,
        name: "新しい名前",
        color: expect.stringMatching(NOTE_COLOR_PATTERN),
      },
    ]);
  });

  it("upsertMember の name が undefined なら空文字で保存される", async () => {
    const stub = roomStub("room-upsert-undef");
    await stub.upsertMember(USER_A, undefined);
    const members = await stub.listMembers();
    expect(members).toEqual([
      {
        userId: USER_A,
        name: "",
        color: expect.stringMatching(NOTE_COLOR_PATTERN),
      },
    ]);
  });

  it("listMembers は参加順（joined_at 昇順）で返す", async () => {
    const stub = roomStub("room-list-order");
    await stub.upsertMember(USER_A, "Alpha");
    await stub.upsertMember(USER_B, "Beta");
    expect(await stub.listMembers()).toEqual([
      {
        userId: USER_A,
        name: "Alpha",
        color: expect.stringMatching(NOTE_COLOR_PATTERN),
      },
      {
        userId: USER_B,
        name: "Beta",
        color: expect.stringMatching(NOTE_COLOR_PATTERN),
      },
    ]);
  });

  it("listMembers は joined_at が同じメンバーを user_id 昇順で返す", async () => {
    const roomId = "room-list-tie-break";
    await runInRoomDO(roomId, (_instance, state) => {
      const joinedAt = "2026-07-12T00:00:00.000Z";
      state.storage.sql.exec(
        `INSERT INTO members (user_id, joined_at, name, color)
         VALUES (?1, ?3, 'Beta', 'blue'), (?2, ?3, 'Alpha', 'yellow')`,
        USER_B,
        USER_A,
        joinedAt,
      );
    });

    expect(await roomStub(roomId).listMembers()).toEqual([
      { userId: USER_A, name: "Alpha", color: "yellow" },
      { userId: USER_B, name: "Beta", color: "blue" },
    ]);
  });

  it("メンバーでないユーザーは isMember で false になる", async () => {
    const stub = roomStub("room-membership");
    await stub.upsertMember(USER_A, "Alpha");
    expect(await stub.isMember(USER_A)).toBe(true);
    expect(await stub.isMember(USER_B)).toBe(false);
  });

  it("メンバーは参加順に並ぶ", async () => {
    const stub = roomStub("room-order");
    await stub.upsertMember(USER_A, "Alpha");
    await stub.upsertMember(USER_B, "Beta");
    expect(await listMemberIds("room-order")).toEqual([USER_A, USER_B]);
  });

  it("通算20名には重複しない色を割り当て、21人目は拒否する", async () => {
    const roomId = "room-member-color-capacity";
    const stub = roomStub(roomId);

    for (let index = 1; index <= 20; index++) {
      await expect(
        stub.upsertMember(userIdAt(index), `Member ${index}`),
      ).resolves.toEqual({
        ok: true,
      });
    }

    const members = await stub.listMembers();
    expect(new Set(members.map((member) => member.color)).size).toBe(20);
    await expect(stub.upsertMember(userIdAt(21), "Member 21")).resolves.toEqual(
      {
        ok: false,
        reason: "room-full",
      },
    );
    expect(await listMemberIds(roomId)).toHaveLength(20);
  });

  it("退出後の再参加は元の色を使い、通算上限を消費しない", async () => {
    const roomId = "room-member-color-rejoin";
    const stub = roomStub(roomId);
    const firstUserId = userIdAt(1);

    await expect(stub.upsertMember(firstUserId, "Member 1")).resolves.toEqual({
      ok: true,
    });
    const firstColor = (await stub.listMembers())[0]?.color;
    await stub.leave(firstUserId);
    await expect(stub.upsertMember(firstUserId, "Member 1")).resolves.toEqual({
      ok: true,
    });
    expect((await stub.listMembers())[0]?.color).toBe(firstColor);
  });
});

describe("RoomDO 進行状態", () => {
  it("getPhase の新規ルーム既定は lobby", async () => {
    // マイグレーション v2 の既定は phase1。新規ルームは initializeNewRoom で lobby にする。
    const stub = roomStub("room-phase-default");
    await stub.initializeNewRoom(USER_A, "Host");
    expect(await stub.getPhase()).toEqual(LOBBY);
  });

  it("setPhase は phase を更新する（ホスト本人のみ）", async () => {
    const stub = roomStub("room-phase-set");
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1), USER_A);
    expect(await stub.getPhase()).toEqual(buildPhaseStep(1));
  });

  it.each([
    buildPhaseStep(3, 2),
    buildPhaseStep(5, 3),
  ])("フェーズ2・3の保存済み進行状態を復元する: %o", async (phase) => {
    const stub = roomStub(`room-phase-roundtrip-${phase.phase}-${phase.step}`);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(phase, USER_A);

    expect(await stub.getPhase()).toEqual(phase);
  });

  it("setPhase は room_owner のホスト以外なら reject（二重防御）", async () => {
    // setPhase は async 関数で throw するため、rejects で受ける。
    // runInDurableObject 経由にすれば unhandled rejection として漏れない。
    await runInRoomDO("room-phase-guard", async (instance) => {
      await instance.initializeNewRoom(USER_A, "Host");
      await expect(
        instance.setPhase(buildPhaseStep(1), USER_B),
      ).rejects.toThrow("進行状態を変更する権限がありません。");
    });
    // 状態は lobby / 既定のまま
    const stub = roomStub("room-phase-guard");
    expect(await stub.getPhase()).toEqual(LOBBY);
  });

  it.each([
    ["phase1-step1", buildPhaseStep(1)],
    ["phase2-step1", buildPhaseStep(1, 2)],
    ["phase2-step3", buildPhaseStep(3, 2)],
    ["phase3-step5", buildPhaseStep(5, 3)],
  ])("保存済みの有効な phase=%s を %o として復元する", async (raw, expected) => {
    const roomId = `room-phase-decode-${raw}`;
    const stub = roomStub(roomId);
    await stub.initializeNewRoom(USER_A, "Host");
    await runInRoomDO(roomId, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room_state SET phase = ?1 WHERE id = 1",
        raw,
      );
    });

    expect(await stub.getPhase()).toEqual(expected);
  });

  // 旧フラット形式（writing / phase1..4）は migration
  // normalize-legacy-phase-values が保存形式ごと正規化する。decode は
  // 正規形式だけを解釈し、それ以外は lobby へ fail-safe する。
  it.each([
    ["garbage", buildLobbyPhase()],
    ["writing", buildLobbyPhase()],
    ["phase2", buildLobbyPhase()],
    ["phase1-step9", buildLobbyPhase()],
    ["phase2-step5", buildLobbyPhase()],
    ["phase3-step6", buildLobbyPhase()],
    ["phase4-step1", buildLobbyPhase()],
  ])("保存済みの無効な phase=%s を %o として復元する", async (raw, expected) => {
    const roomId = `room-phase-decode-${raw}`;
    const stub = roomStub(roomId);
    await stub.initializeNewRoom(USER_A, "Host");
    await runInRoomDO(roomId, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room_state SET phase = ?1 WHERE id = 1",
        raw,
      );
    });

    expect(await stub.getPhase()).toEqual(expected);
  });
});

describe("RoomDO 解散", () => {
  it("disband はストレージを完全に空にする（schema_migrations 含む）", async () => {
    const roomId = "room-disband-empty";
    const stub = roomStub(roomId);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    expect(await listMemberIds(roomId)).toEqual([USER_A, USER_B]);

    await stub.disband();

    // deleteAll 後はテーブル自体が消える。listMembers RPC は使わず storage を直接見る。
    await runInRoomDO(roomId, (_instance, state) => {
      const tables = state.storage.sql
        .exec(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .toArray()
        .map((row) => String(row.name));
      expect(tables).toEqual([]);
    });
  });
});

describe("RoomDO WebSocket の深層防御", () => {
  it("WebSocket 以外のリクエストは 426", async () => {
    const res = await roomStub("room-guard").fetch("https://do/anything");
    expect(res.status).toBe(426);
  });

  it("ユーザーIDヘッダーなしの upgrade は 403（api-worker を経由しない到達）", async () => {
    const res = await roomStub("room-guard").fetch("https://do/ws", {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(403);
  });

  it("HOST_ID_HEADER なしの upgrade は 403", async () => {
    const stub = roomStub("room-guard-no-host");
    await stub.upsertMember(USER_A, "Alpha");
    const res = await stub.fetch("https://do/ws", {
      headers: { Upgrade: "websocket", [USER_ID_HEADER]: USER_A },
    });
    expect(res.status).toBe(403);
  });

  it("非メンバーのユーザーIDでの upgrade は 403", async () => {
    const res = await roomStub("room-guard").fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_B,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(res.status).toBe(403);
  });

  it("メンバーのユーザーID + hostId ヘッダーでの upgrade は 101", async () => {
    const stub = roomStub("room-guard-member");
    await stub.upsertMember(USER_A, "Alpha");
    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(res.status).toBe(101);
    res.webSocket?.accept();
    res.webSocket?.close();
  });

  it("非ホストは自分を HOST_ID_HEADER に指定しても start_phase できない", async () => {
    const roomId = "room-guard-forged-host-start";
    const stub = roomStub(roomId);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");

    const ws = await connectDirectly(roomId, USER_B, USER_B);
    ws.send(JSON.stringify({ type: "start_phase" }));

    await expect(nextJson(ws)).resolves.toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(await stub.getPhase()).toEqual(LOBBY);
    ws.close();
  });

  it("非ホストは自分を HOST_ID_HEADER に指定しても phase:next できない", async () => {
    const roomId = "room-guard-forged-host-next";
    const stub = roomStub(roomId);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(1), USER_A);

    const ws = await connectDirectly(roomId, USER_B, USER_B);
    ws.send(JSON.stringify({ type: "phase:next" }));

    await expect(nextJson(ws)).resolves.toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(1));
    ws.close();
  });
});

// start_phase の認可は WebSocket 経由の room-protocol.spec.ts で検証する
// （ホストだけ phase:updated が届くこと、非ホストは forbidden で拒否されること）。

describe("RoomDO snapshot", () => {
  it("host は snapshot で isHost=true になる", async () => {
    const stub = roomStub("room-snapshot-host");

    await stub.initializeNewRoom(USER_A, "Host");

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });

    expect(res.status).toBe(101);

    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();

    const message = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve);
    });

    const snapshot = JSON.parse(String(message.data));

    expect(snapshot.type).toBe("snapshot");
    expect(snapshot.isHost).toBe(true);
    expect(snapshot.decision).toBeNull();
    expect(snapshot.members).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: USER_A })]),
    );

    ws.close();
  });

  it("member は snapshot で isHost=false になる", async () => {
    const stub = roomStub("room-snapshot-member");

    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_B,
        [HOST_ID_HEADER]: USER_A,
      },
    });

    expect(res.status).toBe(101);

    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();

    const message = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve);
    });

    const snapshot = JSON.parse(String(message.data));

    expect(snapshot.type).toBe("snapshot");
    expect(snapshot.isHost).toBe(false);

    ws.close();
  });
});

describe("RoomDO note:decide の認可", () => {
  const SHARED_NOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const PRIVATE_NOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  async function insertNote(
    roomName: string,
    noteId: string,
    visibility: "private" | "shared",
  ): Promise<void> {
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
          (id, author_id, content, visibility, color, x, y, created_at, updated_at)
         VALUES (?1, ?2, '', ?3, 'yellow', 0, 0, ?4, ?4)`,
        noteId,
        USER_A,
        visibility,
        now,
      );
    });
  }

  it("非ホストは共有付箋を決定できず forbidden で拒否される", async () => {
    const roomName = "room-decide-non-host";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(5), USER_A);
    await insertNote(roomName, SHARED_NOTE_ID, "shared");

    const ws = await connectDirectly(roomName, USER_B, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: SHARED_NOTE_ID }));

    expect(await nextJsonWithin(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it("未参加ユーザーは note:decide を送る WebSocket 接続自体を拒否される", async () => {
    const roomName = "room-decide-non-member";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);

    const response = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_B,
        [HOST_ID_HEADER]: USER_A,
      },
    });

    expect(response.status).toBe(403);
  });

  it("非公開付箋はホストでも決定できず forbidden で拒否される", async () => {
    const roomName = "room-decide-private-note";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);
    await insertNote(roomName, PRIVATE_NOTE_ID, "private");

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: PRIVATE_NOTE_ID }));

    expect(await nextJsonWithin(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });
});

describe("RoomDO note:decide", () => {
  const FIRST_NOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const SECOND_NOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  async function insertSharedNote(
    roomName: string,
    noteId: string,
  ): Promise<void> {
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at)
         VALUES (?1, ?2, '', 'shared', 'yellow', 0, 0, ?3, ?3)`,
        noteId,
        USER_A,
        now,
      );
    });
  }

  it("ホストは Step 1-5 で共有付箋を決定できる", async () => {
    const roomName = "room-decide-host";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);
    await insertSharedNote(roomName, FIRST_NOTE_ID);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: FIRST_NOTE_ID }));

    expect(await nextJson(ws)).toEqual({
      type: "decision:updated",
      phase: 1,
      noteId: FIRST_NOTE_ID,
      decidedBy: USER_A,
    });
    ws.close();

    const reconnect = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    const reconnectWs = reconnect.webSocket;
    if (!reconnectWs) throw new Error("WebSocket 接続を確立できませんでした。");
    reconnectWs.accept();

    expect(await nextJson(reconnectWs)).toMatchObject({
      type: "snapshot",
      decision: {
        phase: 1,
        noteId: FIRST_NOTE_ID,
        decidedBy: USER_A,
      },
    });
    reconnectWs.close();
  });

  it("決定時は送信者と非ホストを含む接続中の全員へ配信する", async () => {
    const roomName = "room-decide-broadcast";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(5), USER_A);
    await insertSharedNote(roomName, FIRST_NOTE_ID);

    const host = await connectDirectly(roomName, USER_A, USER_A);
    const member = await connectDirectly(roomName, USER_B, USER_A);
    const hostMessage = nextJson(host);
    const memberMessage = nextJson(member);
    host.send(JSON.stringify({ type: "note:decide", noteId: FIRST_NOTE_ID }));

    const expected = {
      type: "decision:updated",
      phase: 1,
      noteId: FIRST_NOTE_ID,
      decidedBy: USER_A,
    };
    await expect(hostMessage).resolves.toEqual(expected);
    await expect(memberMessage).resolves.toEqual(expected);
    host.close();
    member.close();
  });

  it("同じフェーズで再確定すると以前の決定を新しい付箋で上書きする", async () => {
    const roomName = "room-decide-replace";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);
    await insertSharedNote(roomName, FIRST_NOTE_ID);
    await insertSharedNote(roomName, SECOND_NOTE_ID);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: FIRST_NOTE_ID }));
    await nextJson(ws);
    ws.send(JSON.stringify({ type: "note:decide", noteId: SECOND_NOTE_ID }));

    expect(await nextJson(ws)).toMatchObject({
      type: "decision:updated",
      noteId: SECOND_NOTE_ID,
    });
    const decision = await runInRoomDO(roomName, (_instance, state) => {
      return state.storage.sql
        .exec("SELECT note_id FROM decisions WHERE phase = 1")
        .one() as { note_id: string };
    });
    expect(decision).toEqual({ note_id: SECOND_NOTE_ID });
    ws.close();
  });

  it("Step 1-4 では note:decide を board-mutation-forbidden で拒否する", async () => {
    const roomName = "room-decide-step-4-forbidden";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(4), USER_A);
    await insertSharedNote(roomName, FIRST_NOTE_ID);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: FIRST_NOTE_ID }));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
      message: expect.stringContaining("1-4 ステルス投票"),
    });
    ws.close();
  });
});

describe("RoomDO phase:next", () => {
  it("全参加者の主観・客観投票が完了するまで Step 1-4 を終了できない", async () => {
    const stub = roomStub("room-phase-voting-incomplete");
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(4), USER_A);

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    ws.send(JSON.stringify({ type: "phase:next" }));
    const message = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    // 投票未完了によるゲート拒否は voting-incomplete。クライアントは
    // このコードでホストへ「強制的に進むか」の確認を出す。
    expect(JSON.parse(String(message.data))).toMatchObject({
      type: "error",
      code: "voting-incomplete",
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(4));
    ws.close();
  });

  it("未投票メンバーが残っていても、ホストは force で Step 1-5 へ進められる", async () => {
    const roomName = "room-phase-force-next";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(4), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "phase:next", force: true }));

    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(5),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(5),
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(5));
    ws.close();
  });

  it("ホスト以外は force を付けても phase を進められない", async () => {
    const roomName = "room-phase-force-non-host";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(4), USER_A);

    const ws = await connectDirectly(roomName, USER_B, USER_A);
    ws.send(JSON.stringify({ type: "phase:next", force: true }));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(4));
    ws.close();
  });

  it("課題が未決定の Step 1-5 では phase:next を拒否し、フェーズを進めない", async () => {
    const roomName = "room-phase-step5-no-decision";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "phase:next" }));

    expect(await nextJsonWithin(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(5));
    ws.close();
  });

  it("lobby では force を付けても phase:next できない", async () => {
    const roomName = "room-phase-force-lobby";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "phase:next", force: true }));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(await stub.getPhase()).toEqual(LOBBY);
    ws.close();
  });

  it("全員の投票が完了していれば force なしで Step 1-5 へ進める", async () => {
    const roomName = "room-phase-voting-complete";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(4), USER_A);
    // 全員が主観1票・客観3票をちょうど使い切った状態を直接作る。
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at)
         VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ?1, '', 'shared', 'yellow', 0, 0, ?2, ?2)`,
        USER_A,
        now,
      );
      for (const userId of [USER_A, USER_B]) {
        state.storage.sql.exec(
          `INSERT INTO note_votes (note_id, user_id, kind, created_at, vote_count)
           VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ?1, 'subjective', ?2, 1),
                  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ?1, 'objective', ?2, 3)`,
          userId,
          now,
        );
      }
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "phase:next" }));

    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(5),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(5),
    });
    ws.close();
  });

  it("フェーズ1の票をフェーズ2の上限・完了判定に持ち越さない", async () => {
    const roomName = "room-phase-votes-are-isolated";
    const phase1NoteId = "11111111-1111-4111-8111-111111111111";
    const phase2NoteId = "22222222-2222-4222-8222-222222222222";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(4), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, '課題', 'shared', 'yellow', 0, 0, ?3, ?3, 1),
                (?4, ?2, 'HMW', 'shared', 'yellow', 100, 0, ?3, ?3, 2)`,
        phase1NoteId,
        USER_A,
        now,
        phase2NoteId,
      );
      state.storage.sql.exec(
        `INSERT INTO note_votes (note_id, user_id, kind, created_at, vote_count)
         VALUES (?1, ?2, 'subjective', ?3, 1),
                (?1, ?2, 'objective', ?3, 3)`,
        phase1NoteId,
        USER_A,
        now,
      );
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(5),
    });
    await nextJson(ws);

    ws.send(JSON.stringify({ type: "note:decide", noteId: phase1NoteId }));
    expect(await nextJson(ws)).toMatchObject({
      type: "decision:updated",
      phase: 1,
      noteId: phase1NoteId,
    });

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(1, 2),
    });
    await nextJson(ws);

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(2, 2),
    });
    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(3, 2),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(3, 2),
    });

    ws.send(
      JSON.stringify({
        type: "note:vote",
        noteId: phase2NoteId,
        kind: "subjective",
      }),
    );
    expect(await nextJson(ws)).toMatchObject({ type: "note:updated" });

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "voting-incomplete",
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(3, 2));

    for (let count = 0; count < 3; count++) {
      ws.send(
        JSON.stringify({
          type: "note:vote",
          noteId: phase2NoteId,
          kind: "objective",
        }),
      );
      expect(await nextJson(ws)).toMatchObject({ type: "note:updated" });
    }

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(4, 2),
      notes: [
        {
          id: phase2NoteId,
          dotVotes: {
            subjective: { count: 1 },
            objective: { count: 3 },
          },
        },
      ],
    });
    await nextJson(ws);
    ws.close();
  });

  it("フェーズ2を phase:next で Step 2-2 から Step 3-1 まで進められる", async () => {
    const roomName = "room-phase2-main-transition";
    const noteId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(2, 2), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, 'HMW', 'shared', 'yellow', 0, 0, ?3, ?3, 2)`,
        noteId,
        USER_A,
        now,
      );
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(3, 2),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(3, 2),
    });

    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO note_votes (note_id, user_id, kind, created_at, vote_count)
         VALUES (?1, ?2, 'subjective', ?3, 1),
                (?1, ?2, 'objective', ?3, 3)`,
        noteId,
        USER_A,
        now,
      );
    });

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(4, 2),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(4, 2),
    });

    ws.send(JSON.stringify({ type: "note:decide", noteId }));
    expect(await nextJson(ws)).toMatchObject({
      type: "decision:updated",
      phase: 2,
      noteId,
    });

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(1, 3),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(1, 3),
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(1, 3));
    ws.close();
  });

  it("フェーズ3を共有・2軸配置・投票・集計確認まで順に進められる", async () => {
    const roomName = "room-phase3-provisional-flow";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1, 3), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:create", content: "新しいアイデア" }));
    const created = (await nextJson(ws)) as { note: { id: string } };

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJsonWithin(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(2, 3),
    });

    ws.send(
      JSON.stringify({
        type: "note:publish",
        noteId: created.note.id,
        x: 16,
        y: 12,
      }),
    );
    expect(await nextJson(ws)).toMatchObject({ type: "note:inserted" });

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(3, 3),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(3, 3),
    });

    ws.send(
      JSON.stringify({
        type: "note:move",
        noteId: created.note.id,
        x: 24,
        y: 80,
      }),
    );
    expect(await nextJson(ws)).toMatchObject({ type: "note:updated" });

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(4, 3),
    });

    ws.send(
      JSON.stringify({
        type: "note:vote",
        noteId: created.note.id,
        kind: "subjective",
      }),
    );
    expect(await nextJson(ws)).toMatchObject({ type: "note:updated" });
    for (let count = 0; count < 3; count++) {
      ws.send(
        JSON.stringify({
          type: "note:vote",
          noteId: created.note.id,
          kind: "objective",
        }),
      );
      expect(await nextJson(ws)).toMatchObject({ type: "note:updated" });
    }

    ws.send(JSON.stringify({ type: "phase:next" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(5, 3),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(5, 3),
    });

    ws.send(JSON.stringify({ type: "note:decide", noteId: created.note.id }));
    expect(await nextJson(ws)).toMatchObject({
      type: "decision:updated",
      phase: 3,
      noteId: created.note.id,
    });
    ws.close();
  });

  it("Step 3-2 は複数参加者へ共有付箋を配信し、近接してもグループ化せず投票を拒否する", async () => {
    const roomName = "room-phase3-share-and-operation-gates";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(1, 3), USER_A);

    const authorWs = await connectDirectly(roomName, USER_A, USER_A);
    const memberWs = await connectDirectly(roomName, USER_B, USER_A);

    authorWs.send(
      JSON.stringify({ type: "note:create", content: "作者のアイデア" }),
    );
    const authorNote = (await nextJson(authorWs)) as { note: { id: string } };
    memberWs.send(
      JSON.stringify({ type: "note:create", content: "参加者のアイデア" }),
    );
    const memberNote = (await nextJson(memberWs)) as { note: { id: string } };

    await stub.setPhase(buildPhaseStep(2, 3), USER_A);

    const publishForBoth = async (
      ws: WebSocket,
      noteId: string,
      x: number,
      y: number,
    ): Promise<void> => {
      const authorMessage = nextJson(authorWs);
      const memberMessage = nextJson(memberWs);
      ws.send(JSON.stringify({ type: "note:publish", noteId, x, y }));

      const [authorPublished, memberPublished] = await Promise.all([
        authorMessage,
        memberMessage,
      ]);
      expect(authorPublished).toMatchObject({
        type: "note:inserted",
        note: { id: noteId, visibility: "shared" },
      });
      expect(memberPublished).toMatchObject({
        type: "note:inserted",
        note: { id: noteId, visibility: "shared" },
      });
    };

    await publishForBoth(authorWs, authorNote.note.id, 40, 40);
    await publishForBoth(memberWs, memberNote.note.id, 41, 41);

    const groupCount = await runInRoomDO(roomName, (_instance, state) => {
      return state.storage.sql
        .exec("SELECT COUNT(*) AS count FROM groups")
        .one().count as number;
    });
    expect(groupCount).toBe(0);

    authorWs.send(
      JSON.stringify({
        type: "note:vote",
        noteId: authorNote.note.id,
        kind: "subjective",
      }),
    );
    expect(await nextJson(authorWs)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(
      await runInRoomDO(
        roomName,
        (_instance, state) =>
          state.storage.sql
            .exec(
              "SELECT COUNT(*) AS count FROM note_votes WHERE note_id = ?1",
              authorNote.note.id,
            )
            .one().count as number,
      ),
    ).toBe(0);

    authorWs.close();
    memberWs.close();
  });

  it.each([
    2, 3, 4, 5,
  ])("フェーズ3 Step3-%i ではグループ操作を拒否し、グループを保存しない", async (step) => {
    const roomName = `room-phase3-group-operation-gate-${step}`;
    const noteIds = [
      "77777777-7777-4777-8777-777777777777",
      "66666666-6666-4666-8666-666666666666",
    ];
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(step, 3), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      for (const noteId of noteIds) {
        state.storage.sql.exec(
          `INSERT INTO notes
               (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
             VALUES (?1, ?2, '共有アイデア', 'shared', 'yellow', 40, 40, ?3, ?3, 3)`,
          noteId,
          USER_A,
          now,
        );
      }
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    const now = new Date().toISOString();
    ws.send(
      JSON.stringify({
        type: "group:create",
        group: {
          id: "88888888-8888-4888-8888-888888888888",
          name: "フェーズ3のグループ",
          noteIds,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(
      await runInRoomDO(
        roomName,
        (_instance, state) =>
          state.storage.sql.exec("SELECT COUNT(*) AS count FROM groups").one()
            .count as number,
      ),
    ).toBe(0);
    ws.close();
  });

  it("Step 3-3 で付箋を近づけても自動グルーピングしない", async () => {
    const roomName = "room-phase3-map-no-auto-grouping";
    const noteIds = [
      "55555555-5555-4555-8555-555555555555",
      "44444444-4444-4444-8444-444444444444",
    ];
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(3, 3), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, '共有アイデア1', 'shared', 'yellow', 10, 10, ?3, ?3, 3),
                (?4, ?2, '共有アイデア2', 'shared', 'blue', 80, 80, ?3, ?3, 3)`,
        noteIds[0],
        USER_A,
        now,
        noteIds[1],
      );
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(
      JSON.stringify({
        type: "note:move",
        noteId: noteIds[0],
        x: 40,
        y: 40,
      }),
    );
    expect(await nextJson(ws)).toMatchObject({
      type: "note:updated",
      note: { id: noteIds[0], x: 40, y: 40 },
    });
    expect(
      await runInRoomDO(
        roomName,
        (_instance, state) =>
          state.storage.sql.exec("SELECT COUNT(*) AS count FROM groups").one()
            .count as number,
      ),
    ).toBe(0);
    ws.close();
  });

  it.each([
    {
      step: 2,
      message: {
        type: "note:publish" as const,
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 101,
        y: 50,
      },
    },
    {
      step: 2,
      message: {
        type: "note:move" as const,
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 50,
        y: -1,
      },
    },
    {
      step: 3,
      message: {
        type: "note:drag" as const,
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 100.1,
        y: 50,
      },
    },
  ])("フェーズ3 Step3-$stepでは2軸マップ外の配置を拒否する", async ({
    step,
    message,
  }) => {
    const roomName = `room-phase3-map-range-${step}-${message.type}`;
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(step, 3), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify(message));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it.each([
    4, 5,
  ])("フェーズ3 Step3-%iでは直接送られた配置移動を拒否する", async (step) => {
    const roomName = `room-phase3-map-move-forbidden-${step}`;
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(step, 3), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    for (const type of ["note:move", "note:drag"] as const) {
      ws.send(
        JSON.stringify({
          type,
          noteId: "99999999-9999-4999-8999-999999999999",
          x: 50,
          y: 50,
        }),
      );
      expect(await nextJson(ws)).toMatchObject({
        type: "error",
        code: "forbidden",
      });
    }
    ws.close();
  });

  it("フェーズ3の2軸マップ配置を別セッションへリアルタイム配信する", async () => {
    const roomName = "room-phase3-map-realtime";
    const noteId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(2, 3), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, '共有アイデア', 'shared', 'yellow', 25, 75, ?3, ?3, 3)`,
        noteId,
        USER_A,
        now,
      );
    });

    const authorWs = await connectDirectly(roomName, USER_A, USER_A);
    const memberWs = await connectDirectly(roomName, USER_B, USER_A);
    authorWs.send(JSON.stringify({ type: "note:drag", noteId, x: 40, y: 60 }));
    expect(await nextJson(memberWs)).toMatchObject({
      type: "note:drag",
      noteId,
      x: 40,
      y: 60,
    });

    authorWs.send(JSON.stringify({ type: "note:move", noteId, x: 50, y: 50 }));
    expect(await nextJson(memberWs)).toMatchObject({
      type: "note:updated",
      note: { id: noteId, x: 50, y: 50 },
    });
    authorWs.close();
    memberWs.close();
  });

  it("host は phase を進められる", async () => {
    const stub = roomStub("room-phase-host");

    await stub.initializeNewRoom(USER_A, "Host");
    // Step 1-1 のまま phase:next → Step 1-2
    await stub.setPhase(buildPhaseStep(1), USER_A);

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });

    expect(res.status).toBe(101);

    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();

    // snapshot を捨てる
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    ws.send(JSON.stringify({ type: "phase:next" }));

    const message = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    const body = JSON.parse(String(message.data));

    expect(body.type).toBe("phase:updated");
    expect(body.phase).toEqual(buildPhaseStep(2));

    ws.close();
  });

  it("member は phase を進められない", async () => {
    const stub = roomStub("room-phase-member");

    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(1), USER_A);

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_B,
        [HOST_ID_HEADER]: USER_A,
      },
    });

    expect(res.status).toBe(101);

    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();

    // snapshot を捨てる
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    ws.send(JSON.stringify({ type: "phase:next" }));

    const message = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    const error = JSON.parse(String(message.data));

    expect(error.type).toBe("error");
    expect(error.code).toBe("forbidden");

    ws.close();
  });

  it("phase 更新は全クライアントへ配信される", async () => {
    const stub = roomStub("room-phase-broadcast");

    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(1), USER_A);

    const hostRes = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });

    const memberRes = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_B,
        [HOST_ID_HEADER]: USER_A,
      },
    });

    expect(hostRes.status).toBe(101);
    expect(memberRes.status).toBe(101);

    const host = hostRes.webSocket;
    const member = memberRes.webSocket;
    if (!host || !member) {
      throw new Error("WebSocket 接続を確立できませんでした。");
    }

    host.accept();
    member.accept();

    // snapshot を受け取る
    await Promise.all([
      new Promise<MessageEvent>((resolve) => {
        host.addEventListener("message", resolve, { once: true });
      }),
      new Promise<MessageEvent>((resolve) => {
        member.addEventListener("message", resolve, { once: true });
      }),
    ]);

    // 各クライアントは phase:updated の1通を受ける
    const collectOne = (ws: WebSocket) =>
      new Promise<unknown>((resolve) => {
        const onMessage = (event: MessageEvent) => {
          ws.removeEventListener("message", onMessage);
          resolve(JSON.parse(String(event.data)));
        };
        ws.addEventListener("message", onMessage);
      });

    const hostPromise = collectOne(host);
    const memberPromise = collectOne(member);

    host.send(JSON.stringify({ type: "phase:next" }));

    const [hostMessage, memberMessage] = await Promise.all([
      hostPromise,
      memberPromise,
    ]);

    for (const msg of [hostMessage, memberMessage]) {
      expect((msg as { type: string }).type).toBe("phase:updated");
      expect((msg as { phase: unknown }).phase).toEqual(buildPhaseStep(2));
    }

    host.close();
    member.close();
  });
});

describe("RoomDO timer:* の認可", () => {
  it.each([
    { type: "timer:start", durationMs: 60_000 },
    { type: "timer:pause" },
    { type: "timer:resume" },
    { type: "timer:extend" },
    { type: "timer:stop" },
  ])("非ホストの $type は forbidden で状態を変更できない", async (command) => {
    const roomId = `room-timer-member-${command.type}`;
    const stub = roomStub(roomId);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_B,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    ws.send(JSON.stringify(command));
    const event = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    expect(JSON.parse(String(event.data))).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it("D1由来 hostId が本人でも RoomDO の所有者でなければ操作できない", async () => {
    const stub = roomStub("room-timer-forged-host-header");
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_B,
        [HOST_ID_HEADER]: USER_B,
      },
    });
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    ws.send(JSON.stringify({ type: "timer:start", durationMs: 60_000 }));
    const event = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    expect(JSON.parse(String(event.data))).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it("ホストでも現在状態に合わない操作は権限エラーと異なる文言で拒否する", async () => {
    const stub = roomStub("room-timer-invalid-state");
    await stub.initializeNewRoom(USER_A, "Host");
    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    const receive = () =>
      new Promise<Record<string, unknown>>((resolve) => {
        ws.addEventListener(
          "message",
          (event) => resolve(JSON.parse(String(event.data))),
          { once: true },
        );
      });
    await receive();

    ws.send(JSON.stringify({ type: "timer:pause" }));
    expect(await receive()).toMatchObject({
      type: "error",
      code: "forbidden",
      message: "この状態ではその操作はできません。",
    });

    ws.send(JSON.stringify({ type: "timer:start", durationMs: 60_000 }));
    await receive();
    ws.send(JSON.stringify({ type: "timer:start", durationMs: 30_000 }));
    expect(await receive()).toMatchObject({
      type: "error",
      code: "forbidden",
      message: "この状態ではその操作はできません。",
    });
    ws.close();
  });

  it("実行中・一時停止中の延長を 99:59 にクランプする", async () => {
    const stub = roomStub("room-timer-extend-limit");
    await stub.initializeNewRoom(USER_A, "Host");
    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    const receive = () =>
      new Promise<Record<string, unknown>>((resolve) => {
        ws.addEventListener(
          "message",
          (event) => resolve(JSON.parse(String(event.data))),
          { once: true },
        );
      });
    await receive();
    ws.send(
      JSON.stringify({
        type: "timer:start",
        durationMs: TIMER_MAX_DURATION_MS - 30_000,
      }),
    );
    const started = await receive();
    ws.send(JSON.stringify({ type: "timer:extend" }));
    const extended = await receive();
    expect(extended).toMatchObject({
      type: "timer:updated",
      timer: { status: "running", durationMs: TIMER_MAX_DURATION_MS },
    });
    expect((extended.timer as { endsAt: number }).endsAt).toBe(
      (started.timer as { endsAt: number }).endsAt + 30_000,
    );

    ws.send(JSON.stringify({ type: "timer:stop" }));
    await receive();
    ws.send(
      JSON.stringify({
        type: "timer:start",
        durationMs: TIMER_MAX_DURATION_MS - 30_000,
      }),
    );
    await receive();
    ws.send(JSON.stringify({ type: "timer:pause" }));
    const paused = await receive();
    ws.send(JSON.stringify({ type: "timer:extend" }));
    const extendedPaused = await receive();
    expect(extendedPaused).toMatchObject({
      type: "timer:updated",
      timer: { status: "paused", durationMs: TIMER_MAX_DURATION_MS },
    });
    expect((extendedPaused.timer as { remainingMs: number }).remainingMs).toBe(
      (paused.timer as { remainingMs: number }).remainingMs + 30_000,
    );
    ws.close();
  });

  it("idle への stop は状態変化も配信も行わない", async () => {
    const stub = roomStub("room-timer-stop-idle");
    await stub.initializeNewRoom(USER_A, "Host");
    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    const messages: unknown[] = [];
    ws.addEventListener("message", (event) => {
      messages.push(JSON.parse(String(event.data)));
    });
    ws.send(JSON.stringify({ type: "timer:stop" }));
    expect(await stub.getTimerState()).toEqual({ status: "idle" });
    expect(messages).toEqual([]);
    ws.close();
  });

  it("ホスト操作を状態変化時だけ配信し、停止後は idle を snapshot で復元する", async () => {
    const roomId = "room-timer-host-lifecycle";
    const stub = roomStub(roomId);
    await stub.initializeNewRoom(USER_A, "Host");

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    const receive = () =>
      new Promise<Record<string, unknown>>((resolve) => {
        ws.addEventListener(
          "message",
          (event) => resolve(JSON.parse(String(event.data))),
          { once: true },
        );
      });
    await receive();

    const beforeStart = Date.now();
    ws.send(JSON.stringify({ type: "timer:start", durationMs: 60_000 }));
    const started = await receive();
    expect(started).toMatchObject({
      type: "timer:updated",
      timer: { status: "running", durationMs: 60_000 },
    });
    expect(
      Number((started.timer as { endsAt: number }).endsAt),
    ).toBeGreaterThanOrEqual(beforeStart + 60_000);

    ws.send(JSON.stringify({ type: "timer:pause" }));
    expect(await receive()).toMatchObject({
      type: "timer:updated",
      timer: { status: "paused", durationMs: 60_000 },
    });

    ws.send(JSON.stringify({ type: "timer:extend" }));
    expect(await receive()).toMatchObject({
      type: "timer:updated",
      timer: { status: "paused", durationMs: 120_000 },
    });

    ws.send(JSON.stringify({ type: "timer:resume" }));
    expect(await receive()).toMatchObject({
      type: "timer:updated",
      timer: { status: "running", durationMs: 120_000 },
    });

    ws.send(JSON.stringify({ type: "timer:stop" }));
    expect(await receive()).toMatchObject({
      type: "timer:updated",
      timer: { status: "idle" },
    });
    expect(await stub.getTimerState()).toEqual({ status: "idle" });
    ws.close();

    const reconnect = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    const reconnectWs = reconnect.webSocket;
    if (!reconnectWs) throw new Error("再接続できませんでした。");
    reconnectWs.accept();
    const snapshot = await new Promise<Record<string, unknown>>((resolve) => {
      reconnectWs.addEventListener(
        "message",
        (event) => resolve(JSON.parse(String(event.data))),
        { once: true },
      );
    });
    expect(snapshot).toMatchObject({
      type: "snapshot",
      timer: { status: "idle" },
    });
    expect(snapshot.serverNow).toEqual(expect.any(Number));
    reconnectWs.close();
  });
});

describe("RoomDO 課題整理ステップの境界ゲート", () => {
  it("Step 2-2 以降のフェーズ2ステップでは変更系メッセージをdeny-allで拒否する", async () => {
    const roomName = "room-phase-2-deny-all";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(2, 2), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:create" }));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
      message: expect.stringContaining("2-2 共有する"),
    });
    ws.close();
  });

  it("Step 1-1 では note:vote を付箋の存在確認より前に forbidden で拒否する", async () => {
    const roomName = "room-step-1-1-vote-forbidden";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "start_phase" }));

    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(1),
    });

    ws.send(
      JSON.stringify({
        type: "note:vote",
        noteId: "99999999-9999-4999-8999-999999999999",
        kind: "subjective",
      }),
    );

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
      message: expect.stringContaining("1-1 課題を個人で書く"),
    });
    ws.close();
  });

  it.each([
    {
      step: 1,
      label: "1-1 課題を個人で書く",
      operation: "note:publish",
      message: {
        type: "note:publish",
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 100,
        y: 100,
      },
    },
    {
      step: 1,
      label: "1-1 課題を個人で書く",
      operation: "note:move",
      message: {
        type: "note:move",
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 100,
        y: 100,
      },
    },
    {
      step: 1,
      label: "1-1 課題を個人で書く",
      operation: "group:create",
      message: {
        type: "group:create",
        group: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "未許可グループ",
          noteIds: [
            "99999999-9999-4999-8999-999999999999",
            "88888888-8888-4888-8888-888888888888",
          ],
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T00:00:00.000Z",
        },
      },
    },
    {
      step: 2,
      label: "1-2 共有する",
      operation: "note:create",
      message: { type: "note:create" },
    },
    {
      step: 2,
      label: "1-2 共有する",
      operation: "note:vote",
      message: {
        type: "note:vote",
        noteId: "99999999-9999-4999-8999-999999999999",
        kind: "subjective",
      },
    },
    {
      step: 2,
      label: "1-2 共有する",
      operation: "group:create",
      message: {
        type: "group:create",
        group: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "未許可グループ",
          noteIds: [
            "99999999-9999-4999-8999-999999999999",
            "88888888-8888-4888-8888-888888888888",
          ],
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T00:00:00.000Z",
        },
      },
    },
    {
      step: 3,
      label: "1-3 グループ化",
      operation: "note:create",
      message: { type: "note:create" },
    },
    {
      step: 3,
      label: "1-3 グループ化",
      operation: "note:vote",
      message: {
        type: "note:vote",
        noteId: "99999999-9999-4999-8999-999999999999",
        kind: "subjective",
      },
    },
    {
      step: 3,
      label: "1-3 グループ化",
      operation: "note:update-content",
      message: {
        type: "note:update-content",
        noteId: "99999999-9999-4999-8999-999999999999",
        content: "未許可の更新",
      },
    },
    {
      step: 4,
      label: "1-4 ステルス投票",
      operation: "note:create",
      message: { type: "note:create" },
    },
    {
      step: 4,
      label: "1-4 ステルス投票",
      operation: "note:update-content",
      message: {
        type: "note:update-content",
        noteId: "99999999-9999-4999-8999-999999999999",
        content: "未許可の更新",
      },
    },
    {
      step: 4,
      label: "1-4 ステルス投票",
      operation: "note:move",
      message: {
        type: "note:move",
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 100,
        y: 100,
      },
    },
    {
      step: 4,
      label: "1-4 ステルス投票",
      operation: "note:drag",
      message: {
        type: "note:drag",
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 100,
        y: 100,
      },
    },
    {
      step: 4,
      label: "1-4 ステルス投票",
      operation: "group:update-name",
      message: {
        type: "group:update-name",
        groupId: "99999999-9999-4999-8999-999999999999",
        name: "未許可の更新",
      },
    },
    {
      step: 4,
      label: "1-4 ステルス投票",
      operation: "group:create",
      message: {
        type: "group:create",
        group: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "未許可グループ",
          noteIds: [
            "99999999-9999-4999-8999-999999999999",
            "88888888-8888-4888-8888-888888888888",
          ],
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T00:00:00.000Z",
        },
      },
    },
  ])("Step 1-$step では $operation を個別ハンドラより前に拒否する", async ({
    step,
    label,
    operation,
    message,
  }) => {
    const roomName = `room-step-gate-${step}-${operation}`;
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(step), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify(message));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
      message: expect.stringContaining(label),
    });
    ws.close();
  });

  it.each([
    { type: "note:create" },
    {
      type: "note:publish",
      noteId: "99999999-9999-4999-8999-999999999999",
      x: 100,
      y: 100,
    },
    {
      type: "note:unpublish",
      noteId: "99999999-9999-4999-8999-999999999999",
    },
    {
      type: "note:update-content",
      noteId: "99999999-9999-4999-8999-999999999999",
      content: "拒否される更新",
    },
    {
      type: "note:move",
      noteId: "99999999-9999-4999-8999-999999999999",
      x: 100,
      y: 100,
    },
    {
      type: "note:drag",
      noteId: "99999999-9999-4999-8999-999999999999",
      x: 100,
      y: 100,
    },
    {
      type: "note:delete",
      noteId: "99999999-9999-4999-8999-999999999999",
    },
    {
      type: "note:vote",
      noteId: "99999999-9999-4999-8999-999999999999",
      kind: "subjective",
    },
    {
      type: "note:vote-reset",
      noteId: "99999999-9999-4999-8999-999999999999",
      kind: "subjective",
    },
    {
      type: "group:create",
      group: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "未許可グループ",
        noteIds: [
          "99999999-9999-4999-8999-999999999999",
          "88888888-8888-4888-8888-888888888888",
        ],
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    },
    {
      type: "group:update-name",
      groupId: "99999999-9999-4999-8999-999999999999",
      name: "未許可の更新",
    },
  ])("Step 1-5 では変更操作 $type を拒否する", async (message) => {
    const roomName = `room-step-5-${message.type}`;
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify(message));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
      message: expect.stringContaining("1-5 集計確認・絞り込み"),
    });
    ws.close();
  });

  it("Step 1-2 では note:update-content を許可し、共有中の誤字を修正できる", async () => {
    const roomName = "room-step-1-2-update-content-allowed";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:create" }));
    const inserted = (await nextJson(ws)) as { note: { id: string } };
    const noteId = inserted.note.id;

    await stub.setPhase(buildPhaseStep(2), USER_A);
    ws.send(JSON.stringify({ type: "note:publish", noteId, x: 100, y: 100 }));
    await nextJson(ws);

    ws.send(
      JSON.stringify({
        type: "note:update-content",
        noteId,
        content: "誤字を修正しました",
      }),
    );
    expect(await nextJson(ws)).toMatchObject({
      type: "note:updated",
      note: { id: noteId, content: "誤字を修正しました" },
    });

    ws.close();
  });
});

describe("RoomDO Step 1-5 のボード凍結", () => {
  it("Step 1-5 では非公開付箋を公開できない", async () => {
    const stub = roomStub("room-phase4-publish-freeze");
    await stub.initializeNewRoom(USER_A, "Host");
    // lobby のままでは付箋を作れないため、ボード工程に進めてから凍結を検証する。
    await stub.setPhase(buildPhaseStep(1), USER_A);

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    ws.send(JSON.stringify({ type: "note:create" }));
    const insertedEvent = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    const inserted = JSON.parse(String(insertedEvent.data)) as {
      type: string;
      note: { id: string };
    };
    expect(inserted.type).toBe("note:inserted");

    await stub.setPhase(buildPhaseStep(5), USER_A);
    ws.send(
      JSON.stringify({
        type: "note:publish",
        noteId: inserted.note.id,
        x: 100,
        y: 100,
      }),
    );

    const errorEvent = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    expect(JSON.parse(String(errorEvent.data))).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    ws.close();
  });

  it("Step 1-5 では共有付箋を非公開に戻せない", async () => {
    const stub = roomStub("room-phase4-unpublish-freeze");
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1), USER_A);

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    ws.send(JSON.stringify({ type: "note:create" }));
    const draftEvent = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    const draft = JSON.parse(String(draftEvent.data)) as {
      note: { id: string };
    };

    ws.send(
      JSON.stringify({
        type: "note:publish",
        noteId: draft.note.id,
        x: 100,
        y: 100,
      }),
    );
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    await stub.setPhase(buildPhaseStep(5), USER_A);
    ws.send(JSON.stringify({ type: "note:unpublish", noteId: draft.note.id }));

    const errorEvent = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    expect(JSON.parse(String(errorEvent.data))).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    ws.close();
  });

  it("Step 1-5 では WebSocket からの付箋本文更新を拒否し、付箋内容を維持する", async () => {
    const stub = roomStub("room-phase4-freeze");
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1), USER_A);

    const res = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });

    ws.send(JSON.stringify({ type: "note:create" }));
    const insertedEvent = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    const inserted = JSON.parse(String(insertedEvent.data)) as {
      type: string;
      note: { id: string; content: string };
    };
    expect(inserted.type).toBe("note:inserted");

    await stub.setPhase(buildPhaseStep(5), USER_A);
    ws.send(
      JSON.stringify({
        type: "note:update-content",
        noteId: inserted.note.id,
        content: "Step 1-5 中の書き換え",
      }),
    );

    const errorEvent = await new Promise<MessageEvent>((resolve) => {
      ws.addEventListener("message", resolve, { once: true });
    });
    expect(JSON.parse(String(errorEvent.data))).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    ws.close();
  });
});

describe("RoomDO lobby のボード凍結", () => {
  it("lobby では note:create が拒否され、付箋は作成されない", async () => {
    const roomName = "room-lobby-create-freeze";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:create" }));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    const noteCount = await runInRoomDO(roomName, (_instance, state) => {
      return state.storage.sql.exec("SELECT COUNT(*) AS c FROM notes").one()
        .c as number;
    });
    expect(noteCount).toBe(0);

    ws.close();
  });

  it("lobby では note:vote が付箋の存在確認より前に境界で拒否される", async () => {
    const roomName = "room-lobby-vote-freeze";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(
      JSON.stringify({
        type: "note:vote",
        noteId: "99999999-9999-4999-8999-999999999999",
        kind: "subjective",
      }),
    );

    // not-found ではなく forbidden: ガードが個別処理より先に効いている。
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    ws.close();
  });

  it("lobby では group:create が拒否され、グループは作成されない", async () => {
    const roomName = "room-lobby-group-freeze";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");

    // 共有付箋の検証（hasOnlySharedNotes）を通過する状態を直接作り、
    // 境界ガードがなければ group:create が成功してしまうことを保証する。
    const sharedNoteIds = [
      "77777777-7777-4777-8777-777777777777",
      "66666666-6666-4666-8666-666666666666",
    ];
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      for (const noteId of sharedNoteIds) {
        state.storage.sql.exec(
          `INSERT INTO notes (id, author_id, content, visibility, color, x, y, created_at, updated_at)
           VALUES (?1, ?2, '', 'shared', 'yellow', 0, 0, ?3, ?3)`,
          noteId,
          USER_A,
          now,
        );
      }
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    const now = new Date().toISOString();
    ws.send(
      JSON.stringify({
        type: "group:create",
        group: {
          id: "88888888-8888-4888-8888-888888888888",
          name: "lobby中のグループ",
          noteIds: sharedNoteIds,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    const groupCount = await runInRoomDO(roomName, (_instance, state) => {
      return state.storage.sql.exec("SELECT COUNT(*) AS c FROM groups").one()
        .c as number;
    });
    expect(groupCount).toBe(0);

    ws.close();
  });

  it("start_phase で Step 1-1 に進むと note:create が通る（凍結は lobby 限定）", async () => {
    const roomName = "room-lobby-unfreeze";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "start_phase" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(1),
    });

    ws.send(JSON.stringify({ type: "note:create" }));
    expect(await nextJson(ws)).toMatchObject({ type: "note:inserted" });

    ws.close();
  });
});

describe("RoomDO フェーズ2の投票・決定ゲート", () => {
  const HMW_NOTE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  it("Step 2-3 では投票が許可される", async () => {
    const roomName = "room-phase2-vote-gate";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(3, 2), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, 'HMW', 'shared', 'yellow', 0, 0, ?3, ?3, 2)`,
        HMW_NOTE_ID,
        USER_A,
        now,
      );
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(
      JSON.stringify({
        type: "note:vote",
        noteId: HMW_NOTE_ID,
        kind: "subjective",
      }),
    );
    expect(await nextJson(ws)).toMatchObject({ type: "note:updated" });
    ws.close();
  });

  it("Step 2-4 ではホストのHMW決定が許可される", async () => {
    const roomName = "room-phase2-decide-gate";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(4, 2), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, 'HMW', 'shared', 'yellow', 0, 0, ?3, ?3, 2)`,
        HMW_NOTE_ID,
        USER_A,
        now,
      );
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: HMW_NOTE_ID }));
    expect(await nextJson(ws)).toMatchObject({
      type: "decision:updated",
      phase: 2,
      noteId: HMW_NOTE_ID,
    });
    ws.close();
  });

  it("Step 2-4 では非ホストのHMW決定を forbidden で拒否する", async () => {
    const roomName = "room-phase2-decide-non-host";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(4, 2), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, 'HMW', 'shared', 'yellow', 0, 0, ?3, ?3, 2)`,
        HMW_NOTE_ID,
        USER_A,
        now,
      );
    });

    const ws = await connectDirectly(roomName, USER_B, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: HMW_NOTE_ID }));
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it("未投票メンバーが残っていても、ホストは force で Step 2-4 へ進められる", async () => {
    const roomName = "room-phase2-voting-incomplete-force";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(3, 2), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "phase:next", force: true }));
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(4, 2),
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(4, 2),
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(4, 2));
    ws.close();
  });

  it("Step 2-3ではホスト以外が force を付けても進められない", async () => {
    const roomName = "room-phase2-force-non-host";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(3, 2), USER_A);

    const ws = await connectDirectly(roomName, USER_B, USER_A);
    ws.send(JSON.stringify({ type: "phase:next", force: true }));

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(3, 2));
    ws.close();
  });
});

describe("RoomDO フェーズ1→2 の遷移と決定課題の持ち越し", () => {
  const DECIDED_NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  async function insertSharedNote(
    roomName: string,
    noteId: string,
    content: string,
  ): Promise<void> {
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'shared', 'yellow', 0, 0, ?4, ?4)`,
        noteId,
        USER_A,
        content,
        now,
      );
    });
  }

  // Step 1-5 で決定済みの状態から phase:next で Step 2-1 へ遷移させる。
  async function decideAndAdvance(roomName: string): Promise<void> {
    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: DECIDED_NOTE_ID }));
    await nextJson(ws); // decision:updated
    ws.send(JSON.stringify({ type: "phase:next" }));
    await nextJson(ws); // snapshot
    await nextJson(ws); // phase:updated
    ws.close();
  }

  it("課題決定済みの Step 1-5 から phase:next で Step 2-1 へ進み、snapshot で持ち越しを配信する", async () => {
    const roomName = "room-carryover-transition";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);
    await insertSharedNote(
      roomName,
      DECIDED_NOTE_ID,
      "宿題を後回しにしてしまう",
    );

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:decide", noteId: DECIDED_NOTE_ID }));
    await nextJson(ws); // decision:updated

    ws.send(JSON.stringify({ type: "phase:next" }));

    // 遷移時は接続中の全員に snapshot を再送してから phase:updated を配る
    // （投票→結果ステップ遷移と同じ順序）。
    expect(await nextJson(ws)).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(1, 2),
      carryovers: [
        {
          phase: 1,
          noteId: DECIDED_NOTE_ID,
          content: "宿題を後回しにしてしまう",
        },
      ],
    });
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(1, 2),
    });
    expect(await stub.getPhase()).toEqual(buildPhaseStep(1, 2));
    ws.close();
  });

  it("Step 2-1 の再接続 snapshot は前フェーズの決定を持ち越し、現在フェーズの decision は null になる", async () => {
    const roomName = "room-carryover-reconnect";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);
    await insertSharedNote(roomName, DECIDED_NOTE_ID, "決定した課題");
    await decideAndAdvance(roomName);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    // connectDirectly が受信済みの snapshot を検証し直すため再接続する。
    const reconnect = await roomStub(roomName).fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    const reconnectWs = reconnect.webSocket;
    if (!reconnectWs) throw new Error("WebSocket 接続を確立できませんでした。");
    reconnectWs.accept();

    const snapshot = await nextJson(reconnectWs);
    expect(snapshot).toMatchObject({
      type: "snapshot",
      phase: buildPhaseStep(1, 2),
      carryovers: [
        { phase: 1, noteId: DECIDED_NOTE_ID, content: "決定した課題" },
      ],
    });
    expect(snapshot.decision).toBeNull();
    ws.close();
    reconnectWs.close();
  });

  it("決定後に元の付箋が削除されても、持ち越しは決定時点の内容を保持する", async () => {
    const roomName = "room-carryover-note-deleted";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(5), USER_A);
    await insertSharedNote(roomName, DECIDED_NOTE_ID, "決定時点の内容");
    await decideAndAdvance(roomName);

    await runInRoomDO(roomName, (_instance, state) => {
      state.storage.sql.exec(
        "DELETE FROM notes WHERE id = ?1",
        DECIDED_NOTE_ID,
      );
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    const reconnect = await roomStub(roomName).fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    const reconnectWs = reconnect.webSocket;
    if (!reconnectWs) throw new Error("WebSocket 接続を確立できませんでした。");
    reconnectWs.accept();

    expect(await nextJson(reconnectWs)).toMatchObject({
      type: "snapshot",
      carryovers: [
        { phase: 1, noteId: DECIDED_NOTE_ID, content: "決定時点の内容" },
      ],
    });
    ws.close();
    reconnectWs.close();
  });
});

describe("RoomDO 共有ステップ終了時のマイ付箋の破棄", () => {
  const SHARED_NOTE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const PRIVATE_NOTE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

  async function insertNote(
    roomName: string,
    noteId: string,
    visibility: "private" | "shared",
    content: string,
  ): Promise<void> {
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'yellow', 0, 0, ?5, ?5)`,
        noteId,
        USER_A,
        content,
        visibility,
        now,
      );
    });
  }

  async function insertVote(roomName: string, noteId: string): Promise<void> {
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO note_votes (note_id, user_id, kind, created_at, vote_count)
         VALUES (?1, ?2, 'subjective', ?3, 1)`,
        noteId,
        USER_A,
        now,
      );
    });
  }

  async function countPrivateNotes(roomName: string): Promise<number> {
    return await runInRoomDO(roomName, (_instance, state) => {
      return state.storage.sql
        .exec(
          "SELECT COUNT(*) AS count FROM notes WHERE visibility = 'private'",
        )
        .one().count as number;
    });
  }

  async function countVotes(roomName: string, noteId: string): Promise<number> {
    return await runInRoomDO(roomName, (_instance, state) => {
      return state.storage.sql
        .exec(
          "SELECT COUNT(*) AS count FROM note_votes WHERE note_id = ?1",
          noteId,
        )
        .one().count as number;
    });
  }

  it("Step 1-2 から 1-3 へ進むと、共有しなかったマイ付箋とその票を破棄する", async () => {
    const roomName = "room-discard-private-notes-leaving-sharing-step";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(2), USER_A);
    await insertNote(roomName, SHARED_NOTE_ID, "shared", "共有した課題");
    await insertNote(
      roomName,
      PRIVATE_NOTE_ID,
      "private",
      "共有しなかった下書き",
    );
    // 削除した付箋の票が孤児として残らないこと、かつ掃除が private に
    // 限定され共有付箋の票を巻き込まないことの両方を検証する。
    await insertVote(roomName, PRIVATE_NOTE_ID);
    await insertVote(roomName, SHARED_NOTE_ID);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "phase:next" }));

    // 破棄をクライアントへ伝える経路は snapshot の再送だけ。phase:updated の
    // 前に届かないと、消えたはずのマイ付箋が画面に残り続ける。
    const snapshot = (await nextJson(ws)) as {
      type: string;
      notes: { id: string }[];
    };
    expect(snapshot.type).toBe("snapshot");
    expect(snapshot.notes.map((note) => note.id)).toEqual([SHARED_NOTE_ID]);
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(3),
    });

    expect(await countPrivateNotes(roomName)).toBe(0);
    expect(await countVotes(roomName, PRIVATE_NOTE_ID)).toBe(0);
    expect(await countVotes(roomName, SHARED_NOTE_ID)).toBe(1);
    ws.close();
  });

  it("Step 1-1 から 1-2 へ進む時点ではマイ付箋を破棄しない", async () => {
    const roomName = "room-keep-private-notes-entering-sharing-step";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1), USER_A);
    await insertNote(
      roomName,
      PRIVATE_NOTE_ID,
      "private",
      "これから共有する下書き",
    );

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "phase:next" }));

    // 共有ステップに入る側では掃除も snapshot 再送も起こさない。ここで
    // 消すと、共有する前に下書きを失う。
    expect(await nextJson(ws)).toMatchObject({
      type: "phase:updated",
      phase: buildPhaseStep(2),
    });
    expect(await countPrivateNotes(roomName)).toBe(1);
    ws.close();
  });
});

describe("RoomDO Step 2-1 の境界ゲート", () => {
  it("Step 2-1 では content 付き note:create で自分専用付箋を作成できる", async () => {
    const roomName = "room-step2-1-create";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1, 2), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:create", content: "もっと簡単に" }));

    expect(await nextJson(ws)).toMatchObject({
      type: "note:inserted",
      note: {
        authorId: USER_A,
        content: "もっと簡単に",
        visibility: "private",
      },
    });
    expect(
      await runInRoomDO(
        roomName,
        (_instance, state) =>
          state.storage.sql
            .exec("SELECT phase FROM notes WHERE author_id = ?1", USER_A)
            .one().phase,
      ),
    ).toBe(2);
    ws.close();
  });

  it("Step 2-1 では他者の HMW 付箋が snapshot に含まれず、note:vote も forbidden になる", async () => {
    const roomName = "room-step2-1-others-hidden";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(1, 2), USER_A);

    const memberWs = await connectDirectly(roomName, USER_B, USER_A);
    memberWs.send(
      JSON.stringify({ type: "note:create", content: "他人のHMW" }),
    );
    const inserted = (await nextJson(memberWs)) as {
      note: { id: string };
    };

    const hostWs = await connectDirectly(roomName, USER_A, USER_A);
    const reconnect = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    const reconnectWs = reconnect.webSocket;
    if (!reconnectWs) throw new Error("WebSocket 接続を確立できませんでした。");
    reconnectWs.accept();
    const snapshot = (await nextJson(reconnectWs)) as {
      notes: { id: string }[];
    };
    expect(snapshot.notes).toEqual([]);

    hostWs.send(
      JSON.stringify({
        type: "note:vote",
        noteId: inserted.note.id,
        kind: "subjective",
      }),
    );
    expect(await nextJson(hostWs)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    memberWs.close();
    hostWs.close();
    reconnectWs.close();
  });

  it("Step 2-1 では note:publish が forbidden になる（共有は Step 2-2 のスコープ）", async () => {
    const roomName = "room-step2-1-publish-forbidden";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1, 2), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:create", content: "自分のHMW" }));
    const inserted = (await nextJson(ws)) as { note: { id: string } };

    ws.send(
      JSON.stringify({
        type: "note:publish",
        noteId: inserted.note.id,
        x: 100,
        y: 100,
      }),
    );
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it("note:create の content が上限超過なら invalid-message で拒否される", async () => {
    const roomName = "room-step2-1-content-too-long";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1, 2), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(
      JSON.stringify({ type: "note:create", content: "あ".repeat(2001) }),
    );

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "invalid-message",
    });
    ws.close();
  });

  // フェーズ1から残っている共有付箋は、個人執筆ステップでは記録として凍結する。
  // 1-2 の「共有付箋は全員で修正できる」認可（canEdit）が 2-1 に漏れ込まないこと。
  const SHARED_NOTE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  async function insertSharedNoteByA(
    roomName: string,
    content: string,
  ): Promise<void> {
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'shared', 'yellow', 0, 0, ?4, ?4)`,
        SHARED_NOTE_ID,
        USER_A,
        content,
        now,
      );
    });
  }

  it("Step 2-1 では非 author による共有付箋への note:update-content が forbidden になる", async () => {
    const roomName = "room-step2-1-shared-update-non-author";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(1, 2), USER_A);
    await insertSharedNoteByA(roomName, "フェーズ1の記録");

    const ws = await connectDirectly(roomName, USER_B, USER_A);
    ws.send(
      JSON.stringify({
        type: "note:update-content",
        noteId: SHARED_NOTE_ID,
        content: "改ざん",
      }),
    );

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    const row = await runInRoomDO(roomName, (_instance, state) => {
      return state.storage.sql
        .exec("SELECT content FROM notes WHERE id = ?1", SHARED_NOTE_ID)
        .one() as { content: string };
    });
    expect(row.content).toBe("フェーズ1の記録");
    ws.close();
  });

  it("Step 2-1 では author 自身も共有付箋の note:update-content / note:delete ができない", async () => {
    const roomName = "room-step2-1-shared-author-frozen";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1, 2), USER_A);
    await insertSharedNoteByA(roomName, "フェーズ1の記録");

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(
      JSON.stringify({
        type: "note:update-content",
        noteId: SHARED_NOTE_ID,
        content: "書き換え",
      }),
    );
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    ws.send(JSON.stringify({ type: "note:delete", noteId: SHARED_NOTE_ID }));
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    const count = await runInRoomDO(roomName, (_instance, state) => {
      return state.storage.sql
        .exec("SELECT COUNT(*) AS c FROM notes WHERE id = ?1", SHARED_NOTE_ID)
        .one().c as number;
    });
    expect(count).toBe(1);
    ws.close();
  });

  it("Step 2-1 では自分の private 付箋の編集・削除はできる", async () => {
    const roomName = "room-step2-1-private-editable";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1, 2), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:create", content: "下書き" }));
    const inserted = (await nextJson(ws)) as { note: { id: string } };

    ws.send(
      JSON.stringify({
        type: "note:update-content",
        noteId: inserted.note.id,
        content: "もっと簡単に宿題を進められるだろう？",
      }),
    );
    expect(await nextJson(ws)).toMatchObject({
      type: "note:updated",
      note: { content: "もっと簡単に宿題を進められるだろう？" },
    });

    ws.send(JSON.stringify({ type: "note:delete", noteId: inserted.note.id }));
    expect(await nextJson(ws)).toMatchObject({
      type: "note:deleted",
      noteId: inserted.note.id,
    });
    ws.close();
  });

  it("Step 2-2 では publish した HMW が全員に共有され、近接してもグループ化されない", async () => {
    const roomName = "room-step2-2-share-hmw";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.upsertMember(USER_B, "Member");
    await stub.setPhase(buildPhaseStep(1, 2), USER_A);

    const authorWs = await connectDirectly(roomName, USER_A, USER_A);
    authorWs.send(JSON.stringify({ type: "note:create", content: "HMW" }));
    const inserted = (await nextJson(authorWs)) as { note: { id: string } };

    await stub.setPhase(buildPhaseStep(2, 2), USER_A);
    const memberWs = await connectDirectly(roomName, USER_B, USER_A);
    authorWs.send(
      JSON.stringify({
        type: "note:publish",
        noteId: inserted.note.id,
        x: 100,
        y: 100,
      }),
    );

    expect(await nextJson(memberWs)).toMatchObject({
      type: "note:inserted",
      note: { id: inserted.note.id, visibility: "shared" },
    });
    expect(
      await runInRoomDO(
        roomName,
        (_instance, state) =>
          state.storage.sql.exec("SELECT COUNT(*) AS count FROM groups").one()
            .count,
      ),
    ).toBe(0);

    authorWs.close();
    memberWs.close();
  });

  it("Step 2-2 では投票、Step 2-3 では付箋作成・移動を forbidden にする", async () => {
    const roomName = "room-step2-operation-gates";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(2, 2), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(
      JSON.stringify({
        type: "note:vote",
        noteId: "99999999-9999-4999-8999-999999999999",
        kind: "subjective",
      }),
    );
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    await stub.setPhase(buildPhaseStep(3, 2), USER_A);
    ws.send(JSON.stringify({ type: "note:create", content: "禁止" }));
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.send(
      JSON.stringify({
        type: "note:move",
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 100,
        y: 100,
      }),
    );
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });

  it("付箋は作成時のフェーズに紐づき、Step 2-2 の snapshot は HMW だけを返す", async () => {
    const roomName = "room-step2-note-phase-isolation";
    const oldNoteId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const hmwNoteId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(2, 2), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, '課題', 'shared', 'yellow', 0, 0, ?3, ?3, 1),
                (?4, ?2, 'HMW', 'shared', 'blue', 100, 100, ?3, ?3, 2)`,
        oldNoteId,
        USER_A,
        now,
        hmwNoteId,
      );
    });

    const storedNotes = await runInRoomDO(roomName, (_instance, state) =>
      state.storage.sql
        .exec("SELECT id, phase FROM notes ORDER BY id")
        .toArray(),
    );
    expect(storedNotes).toEqual([
      { id: hmwNoteId, phase: 2 },
      { id: oldNoteId, phase: 1 },
    ]);
    const response = await stub.fetch("https://do/ws", {
      headers: {
        Upgrade: "websocket",
        [USER_ID_HEADER]: USER_A,
        [HOST_ID_HEADER]: USER_A,
      },
    });
    expect(response.status).toBe(101);
    const ws = response.webSocket;
    if (!ws) throw new Error("WebSocket 接続を確立できませんでした。");
    ws.accept();
    const snapshot = (await nextJson(ws)) as {
      notes: { id: string }[];
    };
    expect(snapshot.notes.map((note) => note.id)).toEqual([hmwNoteId]);
    ws.close();
  });

  it("フェーズ2ではフェーズ1の付箋への投票を forbidden にする", async () => {
    const roomName = "room-step2-old-note-vote-forbidden";
    const oldNoteId = "ffffffff-ffff-4fff-8fff-fffffffffff0";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(3, 2), USER_A);
    await runInRoomDO(roomName, (_instance, state) => {
      const now = new Date().toISOString();
      state.storage.sql.exec(
        `INSERT INTO notes
           (id, author_id, content, visibility, color, x, y, created_at, updated_at, phase)
         VALUES (?1, ?2, '課題', 'shared', 'yellow', 0, 0, ?3, ?3, 1)`,
        oldNoteId,
        USER_A,
        now,
      );
    });

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(
      JSON.stringify({
        type: "note:vote",
        noteId: oldNoteId,
        kind: "subjective",
      }),
    );
    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    ws.close();
  });
});

describe("RoomDO Step 3-1 の境界ゲート", () => {
  it("Step 3-1 では note:create で自分専用付箋を作成できる", async () => {
    const roomName = "room-step3-1-create";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1, 3), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(JSON.stringify({ type: "note:create", content: "新しいアイデア" }));

    expect(await nextJson(ws)).toMatchObject({
      type: "note:inserted",
      note: {
        authorId: USER_A,
        content: "新しいアイデア",
        visibility: "private",
      },
    });
    expect(
      await runInRoomDO(
        roomName,
        (_instance, state) =>
          state.storage.sql
            .exec("SELECT phase FROM notes WHERE author_id = ?1", USER_A)
            .one().phase,
      ),
    ).toBe(3);
    ws.close();
  });

  it("Step 3-1 では note:publish が forbidden になる", async () => {
    const roomName = "room-step3-1-publish-forbidden";
    const stub = roomStub(roomName);
    await stub.initializeNewRoom(USER_A, "Host");
    await stub.setPhase(buildPhaseStep(1, 3), USER_A);

    const ws = await connectDirectly(roomName, USER_A, USER_A);
    ws.send(
      JSON.stringify({
        type: "note:publish",
        noteId: "99999999-9999-4999-8999-999999999999",
        x: 100,
        y: 100,
      }),
    );

    expect(await nextJson(ws)).toMatchObject({
      type: "error",
      code: "forbidden",
      message: expect.stringContaining("3-1 アイデアを個人で書く"),
    });
    ws.close();
  });
});
