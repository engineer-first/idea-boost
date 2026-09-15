// useRoomNotes（付箋の状態とプロトコル化・楽観更新ポリシー）の単体テスト。
// ポリシーの検証に集中する:
// - 移動・本文は楽観更新（操作の追従性優先）
// - 削除は楽観しない（author 以外はサーバーが拒否するため、確定を待つ）
// - 自分がドラッグ中の付箋へのエコーは無視する
// - ドラッグ中の座標はスロットルして送る
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAG_BROADCAST_THROTTLE_MS } from "@/contracts/board";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ProtocolNote, ServerMessage } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useRoomNotes } from "./use-room-notes";

const NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const DRAGGED_BY = {
  userId: MEMBER_ID,
  name: "Taro",
  color: "green" as const,
};
const TARGET_NOTE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STICKER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function snapshotMessage(
  notes: ProtocolNote[] = [buildNote({ id: NOTE_ID })],
): ServerMessage {
  return {
    type: "snapshot",
    notes,
    members: [],
    phase: buildPhaseStep(1),
    isHost: true,
    decision: null,
    carryovers: [],
    timer: { status: "idle" },
    serverNow: Date.now(),
  };
}

describe("useRoomNotes", () => {
  const send = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    send.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    return renderHook(() =>
      useRoomNotes({
        send,
        createVoteOperationId: () => "33333333-3333-4333-8333-333333333333",
        createVoteStickerId: () => "44444444-4444-4444-8444-444444444444",
      }),
    );
  }

  it("snapshot で notes を全置換する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0]?.id).toBe(NOTE_ID);
  });

  it("note:drag から付箋ごとの移動者を保持する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() =>
      result.current.applyMessage({
        type: "note:drag",
        noteId: NOTE_ID,
        x: 200,
        y: 300,
        draggedBy: DRAGGED_BY,
      }),
    );

    expect(result.current.remoteNoteDrags).toEqual([
      {
        noteId: NOTE_ID,
        draggedBy: DRAGGED_BY,
        lastSeenAt: expect.any(Number),
      },
    ]);
  });

  it.each([
    {
      name: "ドロップ確定",
      message: {
        type: "note:updated",
        note: buildNote({ id: NOTE_ID, x: 210, y: 310 }),
      } as ServerMessage,
    },
    {
      name: "カーソル退出",
      message: { type: "cursor:left", userId: MEMBER_ID } as ServerMessage,
    },
    {
      name: "メンバー退出",
      message: { type: "member_left", userId: MEMBER_ID } as ServerMessage,
    },
    {
      name: "フェーズ遷移",
      message: {
        type: "phase:updated",
        phase: buildPhaseStep(3),
      } as ServerMessage,
    },
    {
      name: "snapshot再同期",
      message: snapshotMessage(),
    },
  ])("$name で移動者表示を解除する", ({ message }) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));
    act(() =>
      result.current.applyMessage({
        type: "note:drag",
        noteId: NOTE_ID,
        x: 200,
        y: 300,
        draggedBy: DRAGGED_BY,
      }),
    );

    act(() => result.current.applyMessage(message));

    expect(result.current.remoteNoteDrags).toEqual([]);
  });

  it("後続イベントが途切れた移動者表示を短いタイムアウトで解除する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));
    act(() =>
      result.current.applyMessage({
        type: "note:drag",
        noteId: NOTE_ID,
        x: 200,
        y: 300,
        draggedBy: DRAGGED_BY,
      }),
    );

    act(() => vi.advanceTimersByTime(4_000));

    expect(result.current.remoteNoteDrags).toEqual([]);
  });

  it("moveNote は楽観反映し、note:drag をスロットル送信する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.moveNote(NOTE_ID, 200, 300);
    });

    // 楽観反映（サーバー確定を待たない）。
    expect(result.current.notes[0]).toMatchObject({ x: 200, y: 300 });
    // リーディングエッジで 1 回目は即送信。
    expect(send).toHaveBeenCalledWith({
      type: "note:drag",
      noteId: NOTE_ID,
      x: 200,
      y: 300,
    });

    // インターバル内の連続移動は間引かれ、終端で最後の座標だけ送られる。
    act(() => {
      result.current.moveNote(NOTE_ID, 210, 310);
      result.current.moveNote(NOTE_ID, 220, 320);
    });
    expect(send).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(DRAG_BROADCAST_THROTTLE_MS);
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({
      type: "note:drag",
      noteId: NOTE_ID,
      x: 220,
      y: 320,
    });
  });

  it("自分がドラッグ中の付箋への note:drag エコーは無視する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.moveNote(NOTE_ID, 200, 300);
    });
    act(() =>
      result.current.applyMessage({
        type: "note:drag",
        noteId: NOTE_ID,
        x: 10,
        y: 20,
        draggedBy: DRAGGED_BY,
      }),
    );

    // ローカル操作を優先し、巻き戻らない。
    expect(result.current.notes[0]).toMatchObject({ x: 200, y: 300 });
  });

  it("endNoteDrag はドラッグを解除し、確定の note:move を送る", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.moveNote(NOTE_ID, 200, 300);
    });
    act(() => {
      result.current.endNoteDrag(NOTE_ID, 240, 340);
    });

    expect(result.current.draggingNoteId).toBeNull();
    expect(result.current.notes[0]).toMatchObject({ x: 240, y: 340 });
    expect(send).toHaveBeenLastCalledWith({
      type: "note:move",
      noteId: NOTE_ID,
      x: 240,
      y: 340,
    });
  });

  it("changeNoteContent は本文だけ楽観更新し、note:update-content を送る", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => result.current.changeNoteContent(NOTE_ID, "新しい本文"));

    expect(result.current.notes[0]?.content).toBe("新しい本文");
    expect(send).toHaveBeenCalledWith({
      type: "note:update-content",
      noteId: NOTE_ID,
      content: "新しい本文",
    });
  });

  it("deleteNote は楽観更新せず、note:deleted の確定で消える", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => result.current.deleteNote(NOTE_ID));

    // 送信はするが、ローカルにはまだ残る（「消えたのに戻る」揺れ防止）。
    expect(send).toHaveBeenCalledWith({ type: "note:delete", noteId: NOTE_ID });
    expect(result.current.notes).toHaveLength(1);

    act(() =>
      result.current.applyMessage({ type: "note:deleted", noteId: NOTE_ID }),
    );
    expect(result.current.notes).toHaveLength(0);
  });

  it("voteNote は上限内ならドロップ座標へシールを楽観表示して送る", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => result.current.voteNote(NOTE_ID, "subjective", 0.25, 0.75));

    expect(result.current.notes[0]?.dotVotes.subjective).toMatchObject({
      count: 1,
      votedByMe: true,
      ownCount: 1,
    });
    expect(send).toHaveBeenCalledWith({
      type: "note:vote-sticker:add",
      noteId: NOTE_ID,
      stickerId: "44444444-4444-4444-8444-444444444444",
      kind: "subjective",
      x: 0.25,
      y: 0.75,
      operationId: "33333333-3333-4333-8333-333333333333",
    });
    expect(result.current.notes[0]?.dotVoteStickers).toEqual([
      {
        id: "44444444-4444-4444-8444-444444444444",
        kind: "subjective",
        x: 0.25,
        y: 0.75,
      },
    ]);
  });

  it("投票は確定応答までpendingとして表示し、拒否時には楽観表示を戻す", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => result.current.voteNote(NOTE_ID, "objective"));

    expect(result.current.pendingVoteOperations).toEqual([
      {
        id: "33333333-3333-4333-8333-333333333333",
        noteId: NOTE_ID,
        stickerId: "44444444-4444-4444-8444-444444444444",
        kind: "objective",
        action: "add",
      },
    ]);
    expect(result.current.notes[0]?.dotVotes.objective.ownCount).toBe(1);

    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "投票上限を超えています。",
        operationId: "33333333-3333-4333-8333-333333333333",
      }),
    );

    expect(result.current.pendingVoteOperations).toEqual([]);
    expect(result.current.notes[0]?.dotVotes.objective.ownCount).toBe(0);
    expect(result.current.notes[0]?.dotVoteStickers).toEqual([]);
    expect(result.current.voteFeedback).toEqual({
      state: "failed",
      message: "投票上限を超えています。",
    });
  });

  it("投票の上限に達していたら反映も送信もしない", () => {
    const { result } = setup();
    // objective の上限は DOT_VOTE_LIMITS.objective（3）。上限まで消費済みの状態を作る。
    const exhausted = buildNote({
      id: NOTE_ID,
      dotVotes: {
        subjective: { count: 0, votedByMe: false, ownCount: 0 },
        objective: { count: 3, votedByMe: true, ownCount: 3 },
      },
    });
    act(() => result.current.applyMessage(snapshotMessage([exhausted])));

    act(() => result.current.voteNote(NOTE_ID, "objective"));

    expect(result.current.notes[0]?.dotVotes.objective.count).toBe(3);
    expect(send).not.toHaveBeenCalled();
  });

  it("自分のシールを別の付箋へ移し、投票総数を保ったまま送信する", () => {
    const { result } = setup();
    const source = buildNote({
      id: NOTE_ID,
      dotVotes: {
        subjective: { count: 0, votedByMe: false, ownCount: 0 },
        objective: { count: 1, votedByMe: true, ownCount: 1 },
      },
      dotVoteStickers: [{ id: STICKER_ID, kind: "objective", x: 0.2, y: 0.3 }],
    });
    const target = buildNote({ id: TARGET_NOTE_ID });
    act(() => result.current.applyMessage(snapshotMessage([source, target])));

    act(() =>
      result.current.moveVoteSticker(STICKER_ID, TARGET_NOTE_ID, 0.8, 0.9),
    );

    expect(send).toHaveBeenCalledWith({
      type: "note:vote-sticker:move",
      stickerId: STICKER_ID,
      noteId: TARGET_NOTE_ID,
      x: 0.8,
      y: 0.9,
      operationId: "33333333-3333-4333-8333-333333333333",
    });
    expect(result.current.notes[0]?.dotVoteStickers).toEqual([]);
    expect(result.current.notes[1]?.dotVoteStickers).toEqual([
      { id: STICKER_ID, kind: "objective", x: 0.8, y: 0.9 },
    ]);
    expect(result.current.notes[0]?.dotVotes.objective).toEqual({
      count: 0,
      votedByMe: false,
      ownCount: 0,
    });
    expect(result.current.notes[1]?.dotVotes.objective).toEqual({
      count: 1,
      votedByMe: true,
      ownCount: 1,
    });
    expect(result.current.pendingVoteOperations).toEqual([
      expect.objectContaining({
        stickerId: STICKER_ID,
        action: "move",
        previous: { noteId: NOTE_ID, x: 0.2, y: 0.3 },
      }),
    ]);
  });

  it("resetNoteVote は自分の票があるときだけ反映・送信する", () => {
    const { result } = setup();
    const voted = buildNote({
      id: NOTE_ID,
      dotVotes: {
        subjective: { count: 0, votedByMe: false, ownCount: 0 },
        objective: { count: 3, votedByMe: true, ownCount: 2 },
      },
    });
    act(() => result.current.applyMessage(snapshotMessage([voted])));

    act(() => result.current.resetNoteVote(NOTE_ID, "objective"));

    expect(result.current.notes[0]?.dotVotes.objective).toMatchObject({
      count: 1,
      votedByMe: false,
      ownCount: 0,
    });
    expect(send).toHaveBeenCalledWith({
      type: "note:vote-reset",
      noteId: NOTE_ID,
      kind: "objective",
    });

    send.mockReset();
    act(() => result.current.resetNoteVote(NOTE_ID, "objective"));
    expect(send).not.toHaveBeenCalled();
  });

  it("addNote / publishNote / unpublishNote はプロトコルメッセージを送る", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => result.current.addNote());
    expect(send).toHaveBeenCalledWith({ type: "note:create" });

    // テンプレート・具体例を起点にしたプリフィル付き作成。
    act(() => result.current.addNote("もっと簡単に"));
    expect(send).toHaveBeenCalledWith({
      type: "note:create",
      content: "もっと簡単に",
    });

    act(() => result.current.publishNote(NOTE_ID, 50, 60));
    expect(send).toHaveBeenCalledWith({
      type: "note:publish",
      noteId: NOTE_ID,
      x: 50,
      y: 60,
    });

    act(() => result.current.unpublishNote(NOTE_ID));
    expect(send).toHaveBeenCalledWith({
      type: "note:unpublish",
      noteId: NOTE_ID,
    });
  });
});
