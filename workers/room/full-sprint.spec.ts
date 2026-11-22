// 2人の参加者が UI と同じ WebSocket メッセージだけでロビー開始から
// 全14工程（1-1〜1-5・2-1〜2-4・3-1〜3-5）と成果公開・完了ルーム参照まで
// 完走できることを検証する RoomDO 統合テスト。
import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompletedRoom } from "../../contracts/completed-rooms";
import type { RoomPhase } from "../../contracts/phase";
import {
  type ClientMessage,
  type PhaseProgress,
  type ProtocolNote,
  parseServerMessage,
  type ServerMessage,
  type SharingState,
} from "../../contracts/room-protocol";
import {
  connectRoomAs,
  createRoomAs,
  joinRoomAs,
  type RoomSocket,
  runInRoomDO,
  sessionCookieFor,
  type TestUser,
} from "../test-helpers";

const host: TestUser = {
  sub: "11111111-1111-4111-8111-111111111111",
  name: "ホスト",
  email: "host@example.test",
};

const member: TestUser = {
  sub: "22222222-2222-4222-8222-222222222222",
  name: "メンバー",
  email: "member@example.test",
};

const outsider: TestUser = {
  sub: "33333333-3333-4333-8333-333333333333",
  name: "部外者",
  email: "outsider@example.test",
};

type SnapshotMessage = Extract<ServerMessage, { type: "snapshot" }>;

class RoomClient {
  readonly user: TestUser;
  readonly socket: RoomSocket;
  // テストが読み進めたメッセージ。読んでいない受信分は含まない。
  readonly seen: ServerMessage[] = [];
  // 読み進めたかに関係なく、この接続が受信したすべての本文。配信漏れの確認に使う。
  readonly received: string[] = [];
  phase: RoomPhase = { kind: "lobby" };
  phaseRevision = 0;
  groupRevision = 0;
  mapRevision = 0;
  sharing: SharingState | null = null;
  progress: PhaseProgress | null = null;
  readonly notes = new Map<string, ProtocolNote>();

  private readonly progressWaiters: Array<() => void> = [];

  private constructor(user: TestUser, socket: RoomSocket) {
    this.user = user;
    this.socket = socket;
    socket.ws.addEventListener("message", (event) => {
      this.received.push(String(event.data));
      const parsed = parseServerMessage(event.data);
      if (parsed?.type === "phase:progress") {
        this.seen.push(parsed);
        this.progress = parsed.progress;
        for (const notify of this.progressWaiters.splice(0)) notify();
      }
    });
  }

  static async connect(
    user: TestUser,
    roomId: string,
  ): Promise<{ client: RoomClient; initialSnapshot: SnapshotMessage }> {
    const socket = await connectRoomAs(user, roomId);
    const client = new RoomClient(user, socket);
    const first = await socket.next();
    if (first.type !== "snapshot") {
      throw new Error(
        `初回メッセージが snapshot ではありません: ${first.type}`,
      );
    }
    client.apply(first);
    return { client, initialSnapshot: first };
  }

  send(message: ClientMessage): void {
    this.socket.ws.send(JSON.stringify(message));
  }

  private apply(message: ServerMessage): void {
    this.seen.push(message);
    switch (message.type) {
      case "snapshot":
        this.phase = message.phase;
        this.phaseRevision = message.phaseRevision;
        if (message.groupRevision !== undefined) {
          this.groupRevision = message.groupRevision;
        }
        if (message.mapRevision !== undefined) {
          this.mapRevision = message.mapRevision;
        }
        this.sharing = message.sharing ?? null;
        if (message.progress) this.progress = message.progress;
        this.notes.clear();
        for (const note of message.notes) this.notes.set(note.id, note);
        break;
      case "phase:updated":
        this.phase = message.phase;
        this.phaseRevision = message.phaseRevision;
        if (message.groupRevision !== undefined) {
          this.groupRevision = message.groupRevision;
        }
        if (message.mapRevision !== undefined) {
          this.mapRevision = message.mapRevision;
        }
        break;
      case "sharing:updated":
        this.sharing = message.sharing;
        break;
      case "note:inserted":
      case "note:updated":
        this.notes.set(message.note.id, message.note);
        break;
      case "note:deleted":
        this.notes.delete(message.noteId);
        break;
      case "notes:moved":
        this.groupRevision = message.groupRevision;
        for (const note of message.notes) this.notes.set(note.id, note);
        break;
      case "group:updated":
      case "group:deleted":
      case "group:revision":
        if (message.groupRevision !== undefined) {
          this.groupRevision = message.groupRevision;
        }
        break;
      case "idea-map:state":
        if (message.mapRevision !== undefined) {
          this.mapRevision = message.mapRevision;
        }
        break;
      default:
        break;
    }
  }

  // 届かないメッセージを待ち続けず、どの利用者で止まったかを示して失敗させる。
  async next(): Promise<ServerMessage> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`${this.user.name} に5秒以内にメッセージが届きません`),
          ),
        5000,
      );
    });
    try {
      const message = await Promise.race([this.socket.next(), timeout]);
      this.apply(message);
      return message;
    } finally {
      clearTimeout(timer);
    }
  }

  async waitFor<T extends ServerMessage["type"]>(
    type: T,
    predicate?: (message: Extract<ServerMessage, { type: T }>) => boolean,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const skipped: string[] = [];
    for (let i = 0; i < 60; i++) {
      const message = await this.next();
      if (message.type === type) {
        const typed = message as Extract<ServerMessage, { type: T }>;
        if (!predicate || predicate(typed)) return typed;
      }
      skipped.push(message.type);
    }
    throw new Error(
      `${this.user.name} で ${type} を受信できませんでした (受信: ${skipped.join(", ")})`,
    );
  }

  // 同じ接続で複数のメッセージを待つときは、受信を1本にして順不同でそろうまで読む。
  // waitFor を同じ接続で並行させると、互いの待つメッセージを読み捨ててしまう。
  async waitForAll(
    matchers: ((message: ServerMessage) => boolean)[],
  ): Promise<ServerMessage[]> {
    const found: (ServerMessage | undefined)[] = matchers.map(() => undefined);
    const skipped: string[] = [];
    for (let i = 0; i < 60 && found.some((m) => !m); i++) {
      const message = await this.next();
      const index = matchers.findIndex(
        (match, j) => !found[j] && match(message),
      );
      if (index >= 0) found[index] = message;
      else skipped.push(message.type);
    }
    if (found.some((m) => !m))
      throw new Error(
        `${this.user.name} で期待するメッセージがそろいませんでした (受信: ${skipped.join(", ")})`,
      );
    return found as ServerMessage[];
  }

  async waitForProgress(
    predicate: (progress: PhaseProgress) => boolean,
  ): Promise<PhaseProgress> {
    if (this.progress && predicate(this.progress)) return this.progress;
    return await new Promise<PhaseProgress>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `${this.user.name} で期待する phase:progress が届きませんでした (現在: ${JSON.stringify(this.progress)})`,
          ),
        );
      }, 3000);
      const check = () => {
        if (this.progress && predicate(this.progress)) {
          clearTimeout(timeout);
          resolve(this.progress);
          return;
        }
        this.progressWaiters.push(check);
      };
      this.progressWaiters.push(check);
    });
  }

  close(): void {
    this.socket.close();
  }
}

const clients: RoomClient[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const client of clients.splice(0)) client.close();
});

// 発表開始・交代時の 2 秒予告（startsAt）を固定 sleep なしで alarm 経由で消化する。
async function fireSharingTurnStartAlarm(roomId: string): Promise<void> {
  const futureNow = Date.now() + 2500;
  const clock = vi.spyOn(Date, "now").mockReturnValue(futureNow);
  try {
    await runInRoomDO(roomId, (room) => room.alarm());
  } finally {
    clock.mockRestore();
  }
}

// 非共有ステップのタイマーを UI と同じく timer:start で開始する。
async function startStepTimer(
  sender: RoomClient,
  peer: RoomClient,
  durationMs: number,
): Promise<void> {
  sender.send({ type: "timer:start", durationMs });
  await Promise.all([
    sender.waitFor("timer:updated", (m) => m.timer.status === "running"),
    peer.waitFor("timer:updated", (m) => m.timer.status === "running"),
  ]);
}

async function createPrivateNote(
  author: RoomClient,
  content: string,
): Promise<ProtocolNote> {
  const operationId = crypto.randomUUID();
  author.send({ type: "note:create", content, operationId });
  const inserted = await author.waitFor(
    "note:inserted",
    (m) => m.operationId === operationId,
  );
  expect(inserted.note.visibility).toBe("private");
  expect(inserted.note.content).toBe(content);
  return inserted.note;
}

async function publishNote(
  presenter: RoomClient,
  peer: RoomClient,
  note: ProtocolNote,
  x: number,
  y: number,
): Promise<ProtocolNote> {
  const operationId = crypto.randomUUID();
  presenter.send({
    type: "note:publish",
    noteId: note.id,
    x,
    y,
    operationId,
    expectedPhaseRevision: presenter.phaseRevision,
    expectedPositionRevision: note.positionRevision ?? 0,
    expectedVisibilityRevision: note.visibilityRevision ?? 0,
  });
  const [[inserted, shareResult], insertedPeer] = await Promise.all([
    presenter.waitForAll([
      (m) => m.type === "note:inserted" && m.note.id === note.id,
      (m) => m.type === "note:share:result" && m.operationId === operationId,
    ]),
    peer.waitFor("note:inserted", (m) => m.note.id === note.id),
  ]);
  expect(shareResult).toMatchObject({ status: "committed" });
  if (inserted.type !== "note:inserted")
    throw new Error("共有した付箋が届きません");
  expect(inserted.note.visibility).toBe("shared");
  expect(insertedPeer.note.visibility).toBe("shared");
  return inserted.note;
}

async function moveSharedNote(
  mover: RoomClient,
  peer: RoomClient,
  noteId: string,
  delta: { x: number; y: number },
  coordinateSpace: "canvas" | "map",
): Promise<void> {
  const current = mover.notes.get(noteId);
  if (!current) throw new Error(`移動対象の付箋が見つかりません: ${noteId}`);
  const operationId = crypto.randomUUID();
  mover.send({
    type: "note:move:start",
    operationId,
    expectedPhaseRevision: mover.phaseRevision,
    expectedGroupRevision: mover.groupRevision,
    expectedMapRevision: mover.mapRevision,
    coordinateSpace,
    targets: [
      {
        noteId,
        positionRevision: current.positionRevision ?? 0,
        visibilityRevision: current.visibilityRevision ?? 0,
      },
    ],
  });
  const started = await mover.waitFor(
    "note:move:result",
    (m) => m.operationId === operationId,
  );
  expect(started.status).toBe("active");

  mover.send({
    type: "note:move:commit",
    operationId,
    delta,
  });
  const [[committed], peerMoved] = await Promise.all([
    mover.waitForAll([
      (m) => m.type === "note:move:result" && m.operationId === operationId,
      (m) => m.type === "notes:moved" && m.operationId === operationId,
    ]),
    peer.waitFor("notes:moved", (m) => m.operationId === operationId),
  ]);
  expect(committed).toMatchObject({ status: "accepted" });
  expect(peerMoved.notes.some((n) => n.id === noteId)).toBe(true);
  // 相手に届いた位置が、指定した差分だけ動いていること。
  expect(peerMoved.notes.find((n) => n.id === noteId)).toMatchObject({
    x: current.x + delta.x,
    y: current.y + delta.y,
  });
}

async function castAllVotes(
  voter: RoomClient,
  peer: RoomClient,
  subjectiveNoteId: string,
  objectiveNoteIds: readonly [string, string, string],
): Promise<void> {
  // 読み進めたかに関係なく、相手が受信したすべての本文で票の漏れを確かめる。
  const peerReceivedBefore = peer.received.length;
  const votes: Array<{ noteId: string; kind: "subjective" | "objective" }> = [
    { noteId: subjectiveNoteId, kind: "subjective" },
    ...objectiveNoteIds.map((noteId) => ({
      noteId,
      kind: "objective" as const,
    })),
  ];

  for (const [index, vote] of votes.entries()) {
    const operationId = crypto.randomUUID();
    voter.send({
      type: "note:vote-sticker:add",
      noteId: vote.noteId,
      stickerId: crypto.randomUUID(),
      kind: vote.kind,
      x: 0.2 + index * 0.15,
      y: 0.5,
      operationId,
    });
    const updated = await voter.waitFor(
      "note:updated",
      (m) => m.operationId === operationId,
    );
    // 投票中は本人の応答でも総票数 count は秘匿される。
    expect(updated.note.dotVotes.subjective.count).toBeUndefined();
    expect(updated.note.dotVotes.objective.count).toBeUndefined();
  }

  const [voterComplete, peerComplete] = await Promise.all([
    voter.waitFor(
      "member_vote_status",
      (m) => m.userId === voter.user.sub && m.isComplete,
    ),
    peer.waitFor(
      "member_vote_status",
      (m) => m.userId === voter.user.sub && m.isComplete,
    ),
  ]);
  expect(voterComplete.isComplete).toBe(true);
  expect(peerComplete.isComplete).toBe(true);

  // 投票中に相手の個別票（note:updated）が配信されていないこと。
  // 区間は投票開始前から、相手が投票完了の通知を受けるまで（結果の公開前）。
  const peerMessagesDuringVote = peer.received
    .slice(peerReceivedBefore)
    .map((body) => parseServerMessage(body));
  expect(peerMessagesDuringVote.some((m) => m?.type === "note:updated")).toBe(
    false,
  );
}

// 工程が移ると snapshot と phase:updated の両方が届く。届く順に依存せず両方を待つ。
async function waitForPhaseChange(
  clients: readonly RoomClient[],
  phase: RoomPhase,
): Promise<SnapshotMessage[]> {
  const key = JSON.stringify(phase);
  return await Promise.all(
    clients.map(async (client) => {
      const [snapshot, updated] = await client.waitForAll([
        (m) => m.type === "snapshot" && JSON.stringify(m.phase) === key,
        (m) => m.type === "phase:updated" && JSON.stringify(m.phase) === key,
      ]);
      const typed = snapshot as SnapshotMessage;
      // 同じ工程遷移の2つの通知は、同じ工程版を示す。
      expect(updated).toMatchObject({ phaseRevision: typed.phaseRevision });
      return typed;
    }),
  );
}

async function markBothReadyAndAdvance(
  first: RoomClient,
  second: RoomClient,
  expectedNextPhase: RoomPhase,
  options?: { expectSnapshot?: boolean },
): Promise<{
  firstSnapshot?: SnapshotMessage;
  secondSnapshot?: SnapshotMessage;
}> {
  const expectedPhase = first.phase;
  const expectedRevision = first.phaseRevision;

  first.send({
    type: "phase:ready",
    expectedPhase,
    expectedRevision,
    ready: true,
  });
  await first.waitForProgress(
    (p) =>
      p.readyUserIds.includes(first.user.sub) &&
      p.phaseRevision === expectedRevision,
  );

  // 片方だけの準備完了では次へ進めないこと（タイマー動作中）。
  first.send({
    type: "phase:next",
    expectedPhase,
    expectedRevision,
  });
  expect(await first.waitFor("error")).toMatchObject({
    type: "error",
    code: "forbidden",
  });

  second.send({
    type: "phase:ready",
    expectedPhase,
    expectedRevision,
    ready: true,
  });
  await Promise.all([
    first.waitForProgress(
      (p) => p.allReady && p.phaseRevision === expectedRevision,
    ),
    second.waitForProgress(
      (p) => p.allReady && p.phaseRevision === expectedRevision,
    ),
  ]);

  first.send({
    type: "phase:next",
    expectedPhase,
    expectedRevision,
  });

  if (options?.expectSnapshot) {
    const [firstSnapshot, secondSnapshot] = await waitForPhaseChange(
      [first, second],
      expectedNextPhase,
    );
    return { firstSnapshot, secondSnapshot };
  }

  await Promise.all([
    first.waitFor(
      "phase:updated",
      (m) => JSON.stringify(m.phase) === JSON.stringify(expectedNextPhase),
    ),
    second.waitFor(
      "phase:updated",
      (m) => JSON.stringify(m.phase) === JSON.stringify(expectedNextPhase),
    ),
  ]);
  return {};
}

async function runSharingRound(params: {
  roomId: string;
  hostClient: RoomClient;
  memberClient: RoomClient;
  notesByUserId: Map<
    string,
    Array<{ note: ProtocolNote; x: number; y: number }>
  >;
  verifyUnpublishRejectedOnOthersTurn?: boolean;
}): Promise<void> {
  const { roomId, hostClient, memberClient, notesByUserId } = params;
  const byUserId = new Map<string, RoomClient>([
    [host.sub, hostClient],
    [member.sub, memberClient],
  ]);

  const initialSharing = hostClient.sharing;
  if (initialSharing?.status !== "ready") {
    throw new Error(
      `共有準備状態ではありません: ${JSON.stringify(initialSharing)}`,
    );
  }

  hostClient.send({
    type: "sharing:start",
    revision: initialSharing.revision,
    durationMs: 180_000,
  });
  await Promise.all([
    hostClient.waitFor(
      "sharing:updated",
      (m) => m.sharing.status === "active" && m.sharing.startsAt !== null,
    ),
    memberClient.waitFor(
      "sharing:updated",
      (m) => m.sharing.status === "active" && m.sharing.startsAt !== null,
    ),
  ]);

  let publishedByFirstPresenter: ProtocolNote | null = null;

  for (let turnIndex = 0; turnIndex < 2; turnIndex++) {
    await fireSharingTurnStartAlarm(roomId);
    const [hostTurn] = await Promise.all([
      hostClient.waitFor(
        "sharing:updated",
        (m) =>
          m.sharing.status === "active" &&
          m.sharing.currentIndex === turnIndex &&
          m.sharing.startsAt === null,
      ),
      memberClient.waitFor(
        "sharing:updated",
        (m) =>
          m.sharing.status === "active" &&
          m.sharing.currentIndex === turnIndex &&
          m.sharing.startsAt === null,
      ),
    ]);

    const presenterId = hostTurn.sharing.order[turnIndex]?.userId;
    const otherId = hostTurn.sharing.order[1 - turnIndex]?.userId;
    if (!presenterId || !otherId) {
      throw new Error("発表順の参加者が不足しています");
    }
    const presenter = byUserId.get(presenterId);
    const other = byUserId.get(otherId);
    if (!presenter || !other)
      throw new Error("発表者クライアントが見つかりません");

    // 共有の順番でない人の公開・発表完了は拒否されること。
    const otherNotes = notesByUserId.get(otherId) ?? [];
    if (turnIndex === 0 && otherNotes.length > 0) {
      const rejectedPublishOpId = crypto.randomUUID();
      other.send({
        type: "note:publish",
        noteId: otherNotes[0].note.id,
        x: otherNotes[0].x,
        y: otherNotes[0].y,
        operationId: rejectedPublishOpId,
        expectedPhaseRevision: other.phaseRevision,
        expectedPositionRevision: otherNotes[0].note.positionRevision ?? 0,
        expectedVisibilityRevision: otherNotes[0].note.visibilityRevision ?? 0,
      });
      const rejectedShare = await other.waitFor(
        "note:share:result",
        (m) => m.operationId === rejectedPublishOpId,
      );
      expect(rejectedShare.status).toBe("rejected");

      other.send({
        type: "sharing:advance",
        revision: hostTurn.sharing.revision,
        outcome: "done",
      });
      expect(await other.waitFor("error")).toMatchObject({
        type: "error",
        code: "forbidden",
      });
    }

    // #660: 自分の番でないときに、既に共有した自分の付箋をマイ付箋へ戻せないこと。
    if (
      params.verifyUnpublishRejectedOnOthersTurn &&
      turnIndex === 1 &&
      publishedByFirstPresenter
    ) {
      const rejectedUnpublishOpId = crypto.randomUUID();
      other.send({
        type: "note:unpublish",
        noteId: publishedByFirstPresenter.id,
        operationId: rejectedUnpublishOpId,
        expectedPhaseRevision: other.phaseRevision,
        expectedPositionRevision:
          publishedByFirstPresenter.positionRevision ?? 0,
        expectedVisibilityRevision:
          publishedByFirstPresenter.visibilityRevision ?? 0,
      });
      const rejectedUnpublish = await other.waitFor(
        "note:share:result",
        (m) => m.operationId === rejectedUnpublishOpId,
      );
      expect(rejectedUnpublish.status).toBe("rejected");
      expect(other.notes.get(publishedByFirstPresenter.id)?.visibility).toBe(
        "shared",
      );
    }

    // 発表者本人の付箋を公開する。
    for (const item of notesByUserId.get(presenterId) ?? []) {
      const published = await publishNote(
        presenter,
        other,
        item.note,
        item.x,
        item.y,
      );
      if (turnIndex === 0 && !publishedByFirstPresenter) {
        publishedByFirstPresenter = published;
      }
    }

    // 発表者本人が発表を完了する。
    presenter.send({
      type: "sharing:advance",
      revision: hostTurn.sharing.revision,
      outcome: "done",
    });

    if (turnIndex === 0) {
      await Promise.all([
        hostClient.waitFor(
          "sharing:updated",
          (m) =>
            m.sharing.status === "active" &&
            m.sharing.currentIndex === 1 &&
            m.sharing.startsAt !== null,
        ),
        memberClient.waitFor(
          "sharing:updated",
          (m) =>
            m.sharing.status === "active" &&
            m.sharing.currentIndex === 1 &&
            m.sharing.startsAt !== null,
        ),
      ]);
    } else {
      const [completedHost, completedMember] = await Promise.all([
        hostClient.waitFor(
          "sharing:updated",
          (m) => m.sharing.status === "complete",
        ),
        memberClient.waitFor(
          "sharing:updated",
          (m) => m.sharing.status === "complete",
        ),
      ]);
      expect(completedHost.timer.status).toBe("ended");
      expect(completedMember.timer.status).toBe("ended");
    }
  }
}

describe("2人・全14工程のRoomDO完走統合テスト", () => {
  it("ロビー開始から全14工程・成果公開・完了ルーム参照まで2人のWS操作だけで完走し主要不変条件を満たす", async () => {
    const { roomId, inviteCode } = await createRoomAs(host);
    await joinRoomAs(member, inviteCode);

    const { client: hostClient, initialSnapshot: hostInitial } =
      await RoomClient.connect(host, roomId);
    clients.push(hostClient);
    const { client: memberClient, initialSnapshot: memberInitial } =
      await RoomClient.connect(member, roomId);
    clients.push(memberClient);

    expect(hostInitial.phase).toEqual({ kind: "lobby" });
    expect(memberInitial.phase).toEqual({ kind: "lobby" });
    expect(memberInitial.members.map((m) => m.userId)).toEqual([
      host.sub,
      member.sub,
    ]);
    await hostClient.waitForProgress((p) => p.connectedUserIds.length === 2);

    // ------------------------------------------------------------
    // ロビー → 1-1（自分の課題・個人）
    // ------------------------------------------------------------
    hostClient.send({ type: "start_phase" });
    await Promise.all([
      hostClient.waitFor(
        "phase:updated",
        (m) =>
          JSON.stringify(m.phase) ===
          JSON.stringify({ kind: "step", phase: 1, step: 1 }),
      ),
      memberClient.waitFor(
        "phase:updated",
        (m) =>
          JSON.stringify(m.phase) ===
          JSON.stringify({ kind: "step", phase: 1, step: 1 }),
      ),
    ]);

    await startStepTimer(hostClient, memberClient, 300_000);

    // 個人ワークの未共有付箋は、本文を含めて相手へ配信しない。RoomDO は要求を順に
    // 処理するので、相手自身の操作への応答が届いた後に、それまでの受信をすべて見る。
    const memberReceivedBefore11 = memberClient.received.length;
    const p1HostNote1 = await createPrivateNote(
      hostClient,
      "課題A：会議が長い",
    );
    const p1HostNote2 = await createPrivateNote(
      hostClient,
      "課題B：議事録が散らばる",
    );
    const hostReceivedBefore11 = hostClient.received.length;
    const p1MemberNote = await createPrivateNote(
      memberClient,
      "課題C：決定事項が追えない",
    );
    const memberReceived11 = memberClient.received
      .slice(memberReceivedBefore11)
      .join("\n");
    expect(memberReceived11).not.toContain("課題A：会議が長い");
    expect(memberReceived11).not.toContain("課題B：議事録が散らばる");
    expect(memberClient.notes.has(p1HostNote1.id)).toBe(false);
    expect(memberClient.notes.has(p1HostNote2.id)).toBe(false);

    // #653: 旧 host:transfer 要求は拒否され、両者の付箋が消えないこと。
    hostClient.send({
      type: "host:transfer",
      targetUserId: member.sub,
      expectedHostRevision: 0,
    });
    expect(await hostClient.waitFor("error")).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(
      hostClient.received.slice(hostReceivedBefore11).join("\n"),
    ).not.toContain("課題C：決定事項が追えない");
    expect(hostClient.notes.has(p1MemberNote.id)).toBe(false);
    expect(hostClient.notes.has(p1HostNote1.id)).toBe(true);
    expect(hostClient.notes.has(p1HostNote2.id)).toBe(true);
    expect(memberClient.notes.has(p1MemberNote.id)).toBe(true);

    // 1-1 → 1-2。共有の前なので、移行時の snapshot にも相手の本文を含めない。
    await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 1, step: 2 },
      { expectSnapshot: true },
    );
    expect(
      hostClient.received.slice(hostReceivedBefore11).join("\n"),
    ).not.toContain("課題C：");
    const memberReceivedThrough12 = memberClient.received
      .slice(memberReceivedBefore11)
      .join("\n");
    expect(memberReceivedThrough12).not.toContain("課題A：");
    expect(memberReceivedThrough12).not.toContain("課題B：");

    // ------------------------------------------------------------
    // 1-2（課題共有）
    // ------------------------------------------------------------
    await runSharingRound({
      roomId,
      hostClient,
      memberClient,
      notesByUserId: new Map([
        [
          host.sub,
          [
            { note: p1HostNote1, x: 100, y: 100 },
            { note: p1HostNote2, x: 900, y: 100 },
          ],
        ],
        [member.sub, [{ note: p1MemberNote, x: 320, y: 100 }]],
      ]),
    });

    // 共有一巡後、1-2 → 1-3 へ進む。
    hostClient.send({
      type: "phase:next",
      expectedPhase: hostClient.phase,
      expectedRevision: hostClient.phaseRevision,
    });
    await waitForPhaseChange([hostClient, memberClient], {
      kind: "step",
      phase: 1,
      step: 3,
    });

    // ------------------------------------------------------------
    // #717: 1-3 から 1-2 へ戻して再び 1-3 へ進めること
    // ------------------------------------------------------------
    hostClient.send({
      type: "phase:rollback",
      expectedPhase: hostClient.phase,
      expectedRevision: hostClient.phaseRevision,
    });
    const [rolledBackHost, rolledBackMember] = await Promise.all([
      hostClient.waitFor(
        "snapshot",
        (m) =>
          JSON.stringify(m.phase) ===
          JSON.stringify({ kind: "step", phase: 1, step: 2 }),
      ),
      memberClient.waitFor(
        "snapshot",
        (m) =>
          JSON.stringify(m.phase) ===
          JSON.stringify({ kind: "step", phase: 1, step: 2 }),
      ),
    ]);
    expect(rolledBackHost.sharing?.status).toBe("complete");
    expect(rolledBackMember.sharing?.status).toBe("complete");

    // 戻した後も、両者がチェックすれば未完了扱いにならず 1-3 へ進める（#717）。
    await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 1, step: 3 },
      { expectSnapshot: true },
    );

    // ------------------------------------------------------------
    // 1-3（グループ化）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 240_000);
    await moveSharedNote(
      hostClient,
      memberClient,
      p1MemberNote.id,
      { x: 10, y: 0 },
      "canvas",
    );

    // 1-3 → 1-4
    await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 1, step: 4 },
      { expectSnapshot: true },
    );

    // ------------------------------------------------------------
    // 1-4（投票・ステルス投票）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 180_000);

    // 投票完了前は phase:ready(true) も phase:next も拒否されること（#438）。
    // 投票完了前は準備完了自体が拒否されるため、phase:next は投票未完了の状態で拒否される。
    const phaseBeforeVote = hostClient.phase;
    const revisionBeforeVote = hostClient.phaseRevision;
    hostClient.send({
      type: "phase:ready",
      expectedPhase: phaseBeforeVote,
      expectedRevision: revisionBeforeVote,
      ready: true,
    });
    expect(await hostClient.waitFor("error")).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    hostClient.send({
      type: "phase:next",
      expectedPhase: phaseBeforeVote,
      expectedRevision: revisionBeforeVote,
    });
    expect(await hostClient.waitFor("error")).toMatchObject({
      type: "error",
      code: "forbidden",
    });
    expect(hostClient.phase).toEqual(phaseBeforeVote);
    expect(hostClient.phaseRevision).toBe(revisionBeforeVote);

    // p1HostNote1 と p1MemberNote に投票し、p1HostNote2 は 0 票のまま残す（#657）。
    await castAllVotes(hostClient, memberClient, p1HostNote1.id, [
      p1HostNote1.id,
      p1HostNote1.id,
      p1MemberNote.id,
    ]);
    await castAllVotes(memberClient, hostClient, p1HostNote1.id, [
      p1HostNote1.id,
      p1MemberNote.id,
      p1MemberNote.id,
    ]);

    // 1-4 → 1-5（0票の p1HostNote2 が自動除外されること: #657）
    const { firstSnapshot: p1ResultSnapshot } = await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 1, step: 5 },
      { expectSnapshot: true },
    );
    expect(
      p1ResultSnapshot?.notes.find((n) => n.id === p1HostNote2.id)?.excluded,
    ).toBe(true);
    expect(
      p1ResultSnapshot?.notes.find((n) => n.id === p1HostNote1.id),
    ).toMatchObject({
      excluded: false,
      dotVotes: {
        subjective: { count: 2 },
        objective: { count: 3 },
      },
    });
    expect(
      hostClient.seen.some(
        (m) =>
          m.type === "note:bulk-excluded" &&
          m.source === "phase-transition" &&
          m.count === 1,
      ),
    ).toBe(true);

    // ------------------------------------------------------------
    // 1-5（課題決定）→ 2-1（#423）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 600_000);

    // 決定確定前は両者準備完了しても 2-1 へ進めないこと。
    hostClient.send({
      type: "phase:ready",
      expectedPhase: hostClient.phase,
      expectedRevision: hostClient.phaseRevision,
      ready: true,
    });
    memberClient.send({
      type: "phase:ready",
      expectedPhase: memberClient.phase,
      expectedRevision: memberClient.phaseRevision,
      ready: true,
    });
    await hostClient.waitForProgress(
      (p) => p.allReady && p.phaseRevision === hostClient.phaseRevision,
    );
    hostClient.send({
      type: "phase:next",
      expectedPhase: hostClient.phase,
      expectedRevision: hostClient.phaseRevision,
    });
    expect(await hostClient.waitFor("error")).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    // 課題を確定する。
    hostClient.send({ type: "note:decide", noteId: p1HostNote1.id });
    await Promise.all([
      hostClient.waitFor(
        "decision:updated",
        (m) => m.decision?.noteId === p1HostNote1.id,
      ),
      memberClient.waitFor(
        "decision:updated",
        (m) => m.decision?.noteId === p1HostNote1.id,
      ),
    ]);

    // 1-5 → 2-1（既に両者 ready なのでそのまま次フェーズへ進める: #423）
    hostClient.send({
      type: "phase:next",
      expectedPhase: hostClient.phase,
      expectedRevision: hostClient.phaseRevision,
    });
    const [p2StartHost] = await waitForPhaseChange([hostClient, memberClient], {
      kind: "step",
      phase: 2,
      step: 1,
    });
    expect(p2StartHost.carryovers).toEqual([
      expect.objectContaining({
        phase: 1,
        noteId: p1HostNote1.id,
        content: "課題A：会議が長い",
      }),
    ]);

    // ------------------------------------------------------------
    // 2-1（課題に対する問い・個人）(#658)
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 180_000);
    const memberReceivedBefore21 = memberClient.received.length;
    const p2HostNote1 = await createPrivateNote(
      hostClient,
      "問いA：どうすれば会議時間を半分にできるか？",
    );
    const p2HostNote2 = await createPrivateNote(
      hostClient,
      "問いB：どうすれば事前共有だけで済ませられるか？",
    );
    const hostReceivedBefore21 = hostClient.received.length;
    const p2MemberNote = await createPrivateNote(
      memberClient,
      "問いC：どうすれば決定事項を自動で残せるか？",
    );
    const memberReceived21 = memberClient.received
      .slice(memberReceivedBefore21)
      .join("\n");
    expect(memberReceived21).not.toContain("問いA：");
    expect(memberReceived21).not.toContain("問いB：");

    // 2-1 → 2-2。共有の前なので、移行時の snapshot にも相手の本文を含めない。
    await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 2, step: 2 },
      { expectSnapshot: true },
    );
    expect(
      hostClient.received.slice(hostReceivedBefore21).join("\n"),
    ).not.toContain("問いC：");
    const memberReceivedThrough22 = memberClient.received
      .slice(memberReceivedBefore21)
      .join("\n");
    expect(memberReceivedThrough22).not.toContain("問いA：");
    expect(memberReceivedThrough22).not.toContain("問いB：");

    // ------------------------------------------------------------
    // 2-2（問い共有・#660 自分の番でないときの unpublish 拒否）
    // ------------------------------------------------------------
    await runSharingRound({
      roomId,
      hostClient,
      memberClient,
      verifyUnpublishRejectedOnOthersTurn: true,
      notesByUserId: new Map([
        [
          host.sub,
          [
            { note: p2HostNote1, x: 100, y: 120 },
            { note: p2HostNote2, x: 420, y: 120 },
          ],
        ],
        [member.sub, [{ note: p2MemberNote, x: 740, y: 120 }]],
      ]),
    });

    // 2-2 → 2-3
    hostClient.send({
      type: "phase:next",
      expectedPhase: hostClient.phase,
      expectedRevision: hostClient.phaseRevision,
    });
    await waitForPhaseChange([hostClient, memberClient], {
      kind: "step",
      phase: 2,
      step: 3,
    });

    // ------------------------------------------------------------
    // 2-3（問い投票）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 240_000);
    // 2-3 は投票中でも共有付箋を移動できる。
    await moveSharedNote(
      memberClient,
      hostClient,
      p2MemberNote.id,
      { x: 20, y: 10 },
      "canvas",
    );

    // p2HostNote2 は 0 票のまま残す。
    await castAllVotes(hostClient, memberClient, p2HostNote1.id, [
      p2HostNote1.id,
      p2MemberNote.id,
      p2MemberNote.id,
    ]);
    await castAllVotes(memberClient, hostClient, p2MemberNote.id, [
      p2HostNote1.id,
      p2HostNote1.id,
      p2MemberNote.id,
    ]);

    // 2-3 → 2-4
    const { firstSnapshot: p2ResultSnapshot } = await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 2, step: 4 },
      { expectSnapshot: true },
    );
    expect(
      p2ResultSnapshot?.notes.find((n) => n.id === p2HostNote2.id)?.excluded,
    ).toBe(true);

    // ------------------------------------------------------------
    // 2-4（問い決定・#665 確定後も他の付箋を移動できること）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 600_000);
    memberClient.send({ type: "note:decide", noteId: p2HostNote1.id });
    await Promise.all([
      hostClient.waitFor(
        "decision:updated",
        (m) => m.decision?.noteId === p2HostNote1.id,
      ),
      memberClient.waitFor(
        "decision:updated",
        (m) => m.decision?.noteId === p2HostNote1.id,
      ),
    ]);

    // #665: 採用確定後も他の共有付箋を動かせること。
    await moveSharedNote(
      hostClient,
      memberClient,
      p2MemberNote.id,
      { x: 30, y: 15 },
      "canvas",
    );

    // 2-4 → 3-1
    const { firstSnapshot: p3StartSnapshot } = await markBothReadyAndAdvance(
      memberClient,
      hostClient,
      { kind: "step", phase: 3, step: 1 },
      { expectSnapshot: true },
    );
    expect(p3StartSnapshot?.carryovers).toEqual([
      expect.objectContaining({ phase: 1, noteId: p1HostNote1.id }),
      expect.objectContaining({ phase: 2, noteId: p2HostNote1.id }),
    ]);

    // ------------------------------------------------------------
    // 3-1（アイデアを書き出す・個人）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 300_000);
    const memberReceivedBefore31 = memberClient.received.length;
    const p3HostNote1 = await createPrivateNote(
      hostClient,
      "アイデアA：AI要約ボット",
    );
    const p3HostNote2 = await createPrivateNote(
      hostClient,
      "アイデアB：アジェンダ事前ロック",
    );
    const hostReceivedBefore31 = hostClient.received.length;
    const p3MemberNote = await createPrivateNote(
      memberClient,
      "アイデアC：15分タイムボックス通知",
    );

    // 3-1 → 3-2。共有の前なので、移行時の snapshot にも相手の本文を含めない。
    await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 3, step: 2 },
      { expectSnapshot: true },
    );
    expect(
      hostClient.received.slice(hostReceivedBefore31).join("\n"),
    ).not.toContain("アイデアC：");
    const memberReceivedThrough32 = memberClient.received
      .slice(memberReceivedBefore31)
      .join("\n");
    expect(memberReceivedThrough32).not.toContain("アイデアA：");
    expect(memberReceivedThrough32).not.toContain("アイデアB：");

    // ------------------------------------------------------------
    // 3-2（共有・分類：2軸マップ座標 0〜100）
    // ------------------------------------------------------------
    await runSharingRound({
      roomId,
      hostClient,
      memberClient,
      notesByUserId: new Map([
        [
          host.sub,
          [
            { note: p3HostNote1, x: 70, y: 80 },
            { note: p3HostNote2, x: 30, y: 40 },
          ],
        ],
        [member.sub, [{ note: p3MemberNote, x: 60, y: 75 }]],
      ]),
    });

    // 3-2 → 3-3
    hostClient.send({
      type: "phase:next",
      expectedPhase: hostClient.phase,
      expectedRevision: hostClient.phaseRevision,
    });
    await waitForPhaseChange([hostClient, memberClient], {
      kind: "step",
      phase: 3,
      step: 3,
    });

    // ------------------------------------------------------------
    // 3-3（価値×実現のしやすさで評価）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 420_000);
    await moveSharedNote(
      hostClient,
      memberClient,
      p3HostNote1.id,
      { x: 10, y: 5 },
      "map",
    );

    // 3-3 → 3-4
    await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 3, step: 4 },
      { expectSnapshot: true },
    );

    // ------------------------------------------------------------
    // 3-4（ドット投票）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 180_000);
    // p3HostNote2 は 0 票のまま残す。
    await castAllVotes(hostClient, memberClient, p3HostNote1.id, [
      p3HostNote1.id,
      p3HostNote1.id,
      p3MemberNote.id,
    ]);
    await castAllVotes(memberClient, hostClient, p3HostNote1.id, [
      p3HostNote1.id,
      p3MemberNote.id,
      p3MemberNote.id,
    ]);

    // 3-4 → 3-5
    const { firstSnapshot: p3ResultSnapshot } = await markBothReadyAndAdvance(
      hostClient,
      memberClient,
      { kind: "step", phase: 3, step: 5 },
      { expectSnapshot: true },
    );
    expect(
      p3ResultSnapshot?.notes.find((n) => n.id === p3HostNote2.id)?.excluded,
    ).toBe(true);

    // ------------------------------------------------------------
    // 3-5（アイデア決定 → 成果公開）
    // ------------------------------------------------------------
    await startStepTimer(hostClient, memberClient, 600_000);

    // 採用決定前の成果公開は拒否されること。
    hostClient.send({ type: "outcome:publish" });
    expect(await hostClient.waitFor("error")).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    hostClient.send({ type: "note:decide", noteId: p3HostNote1.id });
    await Promise.all(
      [hostClient, memberClient].map((client) =>
        client.waitForAll([
          (m) => m.type === "snapshot" && m.decision?.noteId === p3HostNote1.id,
          (m) =>
            m.type === "decision:updated" &&
            m.decision?.noteId === p3HostNote1.id,
        ]),
      ),
    );

    // 両者の準備完了で成果を公開する。
    hostClient.send({
      type: "phase:ready",
      expectedPhase: hostClient.phase,
      expectedRevision: hostClient.phaseRevision,
      ready: true,
    });
    memberClient.send({
      type: "phase:ready",
      expectedPhase: memberClient.phase,
      expectedRevision: memberClient.phaseRevision,
      ready: true,
    });
    await hostClient.waitForProgress(
      (p) => p.allReady && p.phaseRevision === hostClient.phaseRevision,
    );

    memberClient.send({ type: "outcome:publish" });
    await Promise.all([
      hostClient.waitFor("outcome:published"),
      memberClient.waitFor("outcome:published"),
    ]);

    // 完了後のボード変更は拒否されること。
    hostClient.send({ type: "note:decide", noteId: p3MemberNote.id });
    expect(await hostClient.waitFor("error")).toMatchObject({
      type: "error",
      code: "forbidden",
    });

    // ------------------------------------------------------------
    // 完了ルーム参照 API（両者が参照でき、部外者は 404）
    // ------------------------------------------------------------
    // D1 の閲覧者索引を反映する outbox alarm を進める。
    await runInRoomDO(roomId, (room) => room.alarm());

    for (const participant of [host, member]) {
      const detailRes = await exports.default.fetch(
        `https://api.test/api/completed-rooms/${roomId}`,
        { headers: { Cookie: await sessionCookieFor(participant) } },
      );
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()) as CompletedRoom;
      expect(detail.roomId).toBe(roomId);
      expect(detail.decisions).toEqual([
        { phase: 1, noteId: p1HostNote1.id, content: "課題A：会議が長い" },
        {
          phase: 2,
          noteId: p2HostNote1.id,
          content: "問いA：どうすれば会議時間を半分にできるか？",
        },
        {
          phase: 3,
          noteId: p3HostNote1.id,
          content: "アイデアA：AI要約ボット",
        },
      ]);
      expect(detail.scenes.map((s) => s.kind)).toEqual([
        "problem-grouping",
        "problem-decision",
        "question-decision",
        "idea-mapping",
        "idea-decision",
      ]);

      const listRes = await exports.default.fetch(
        "https://api.test/api/completed-rooms",
        { headers: { Cookie: await sessionCookieFor(participant) } },
      );
      expect(listRes.status).toBe(200);
      const list = (await listRes.json()) as {
        rooms: Array<{ roomId: string; idea: string }>;
      };
      expect(list.rooms).toContainEqual(
        expect.objectContaining({
          roomId,
          idea: "アイデアA：AI要約ボット",
        }),
      );
    }

    const outsiderRes = await exports.default.fetch(
      `https://api.test/api/completed-rooms/${roomId}`,
      { headers: { Cookie: await sessionCookieFor(outsider) } },
    );
    expect(outsiderRes.status).toBe(404);
  });
});
