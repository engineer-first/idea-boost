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
const DRAG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_NOTE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STICKER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FONT_SIZE_OPERATION_ID = "55555555-5555-4555-8555-555555555555";

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
    completedVoterIds: [],
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

  function setup(createFontSizeOperationId = () => FONT_SIZE_OPERATION_ID) {
    return renderHook(() =>
      useRoomNotes({
        send,
        createVoteOperationId: () => "33333333-3333-4333-8333-333333333333",
        createFontSizeOperationId,
        createVoteStickerId: () => "44444444-4444-4444-8444-444444444444",
        createNoteDragId: () => DRAG_ID,
      }),
    );
  }

  it("snapshot で notes を全置換する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0]?.id).toBe(NOTE_ID);
  });

  it("最前面への要求を送り、確定応答までだけ一時最前面を維持する", () => {
    const { result } = setup();
    const selected = buildNote({ id: NOTE_ID, stackOrder: 4 });
    const other = buildNote({ id: TARGET_NOTE_ID, stackOrder: 5 });
    act(() => result.current.applyMessage(snapshotMessage([selected, other])));

    act(() => result.current.bringNoteToFront(NOTE_ID));

    expect(send).toHaveBeenCalledWith({
      type: "note:bring-to-front",
      noteId: NOTE_ID,
    });
    expect(result.current.frontNoteId).toBe(NOTE_ID);

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: { ...other, stackOrder: 6 },
      }),
    );
    expect(result.current.frontNoteId).toBe(NOTE_ID);

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: { ...selected, stackOrder: 7 },
      }),
    );
    expect(result.current.frontNoteId).toBeNull();

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: { ...other, stackOrder: 8 },
      }),
    );
    expect(result.current.frontNoteId).toBeNull();
  });

  it("開始受理までは動かさず、受理後に最新位置だけを楽観反映して送る", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.moveNote(NOTE_ID, 200, 300);
    });

    expect(result.current.notes[0]).not.toMatchObject({ x: 200, y: 300 });
    expect(send).toHaveBeenCalledWith({
      type: "note:drag:start",
      noteId: NOTE_ID,
      dragId: DRAG_ID,
    });
    act(() =>
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      }),
    );
    expect(result.current.notes[0]).toMatchObject({ x: 200, y: 300 });
    expect(send).toHaveBeenLastCalledWith({
      type: "note:drag:move",
      noteId: NOTE_ID,
      dragId: DRAG_ID,
      x: 200,
      y: 300,
    });

    // インターバル内の連続移動は間引かれ、終端で最後の座標だけ送られる。
    act(() => {
      result.current.moveNote(NOTE_ID, 210, 310);
      result.current.moveNote(NOTE_ID, 220, 320);
    });
    expect(send).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(DRAG_BROADCAST_THROTTLE_MS);
    });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith({
      type: "note:drag:move",
      noteId: NOTE_ID,
      dragId: DRAG_ID,
      x: 220,
      y: 320,
    });
  });

  it("pointer cancel は座標なしの終了を送り、ローカル操作権を解除する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      });
      result.current.moveNote(NOTE_ID, 200, 300);
    });
    act(() => {
      result.current.cancelNoteDrag(NOTE_ID);
    });

    expect(result.current.draggingNoteId).toBeNull();
    expect(send).toHaveBeenLastCalledWith({
      type: "note:drag:end",
      noteId: NOTE_ID,
      dragId: DRAG_ID,
      position: null,
    });
  });

  it("private map lockは共有前に本文付箋を隠さず、公開時に通常ドラッグへ昇格する", () => {
    const { result } = setup();
    act(() =>
      result.current.applyMessage(
        snapshotMessage([buildNote({ id: NOTE_ID, visibility: "private" })]),
      ),
    );

    act(() => result.current.startNoteDrag(NOTE_ID, true));
    expect(send).toHaveBeenLastCalledWith({
      type: "note:drag:start",
      noteId: NOTE_ID,
      dragId: DRAG_ID,
    });
    act(() =>
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      }),
    );
    expect(result.current.draggingNoteId).toBeNull();

    act(() => result.current.startNoteDrag(NOTE_ID));
    expect(result.current.draggingNoteId).toBe(NOTE_ID);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returning dragをunpublishしてもpointerup用の操作を保持する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      });
      result.current.unpublishNote(NOTE_ID, true);
    });
    expect(result.current.draggingNoteId).toBeNull();
    expect(send).toHaveBeenLastCalledWith({
      type: "note:unpublish",
      noteId: NOTE_ID,
    });

    act(() => result.current.cancelNoteDrag(NOTE_ID));
    expect(send).toHaveBeenLastCalledWith({
      type: "note:drag:end",
      noteId: NOTE_ID,
      dragId: DRAG_ID,
      position: null,
    });
  });

  it("ドロップ確定までは最前面を維持し、無関係な更新では解除しない", () => {
    const { result } = setup();
    const initial = buildNote({ id: NOTE_ID, x: 100, y: 100, stackOrder: 4 });
    const other = buildNote({ id: TARGET_NOTE_ID, stackOrder: 5 });
    act(() => result.current.applyMessage(snapshotMessage([initial, other])));

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      });
      result.current.moveNote(NOTE_ID, 240, 340);
      result.current.endNoteDrag(NOTE_ID, 240, 340);
    });
    expect(result.current.draggingNoteId).toBeNull();
    expect(result.current.frontNoteId).toBe(NOTE_ID);

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: { ...other, content: "無関係な更新" },
      }),
    );
    expect(result.current.frontNoteId).toBe(NOTE_ID);

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: { ...initial, x: 240, y: 340, stackOrder: 4 },
      }),
    );
    expect(result.current.frontNoteId).toBe(NOTE_ID);

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: { ...initial, x: 240, y: 340, stackOrder: 6 },
      }),
    );
    expect(result.current.frontNoteId).toBeNull();
  });

  it.each([
    {
      name: "snapshot",
      message: snapshotMessage(),
    },
    {
      name: "note:deleted",
      message: { type: "note:deleted", noteId: NOTE_ID } as ServerMessage,
    },
  ])("$name による再同期・削除で確定待ち最前面を解除する", ({ message }) => {
    const { result } = setup();
    act(() =>
      result.current.applyMessage(
        snapshotMessage([
          buildNote({ id: NOTE_ID, x: 100, y: 100, stackOrder: 4 }),
        ]),
      ),
    );
    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      });
      result.current.endNoteDrag(NOTE_ID, 240, 340);
    });
    expect(result.current.frontNoteId).toBe(NOTE_ID);

    act(() => result.current.applyMessage(message));

    expect(result.current.frontNoteId).toBeNull();
  });

  it("pending 中の cancel は即座に終了を送り、後着の開始受理と旧 dragId を無視する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.moveNote(NOTE_ID, 200, 300);
      result.current.cancelNoteDrag(NOTE_ID);
    });

    expect(send).toHaveBeenLastCalledWith({
      type: "note:drag:end",
      noteId: NOTE_ID,
      dragId: DRAG_ID,
      position: null,
    });
    act(() => {
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      });
      result.current.moveNote(NOTE_ID, 400, 500);
    });

    expect(result.current.draggingNoteId).toBeNull();
    expect(result.current.notes[0]).not.toMatchObject({ x: 200, y: 300 });
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "note:drag:move", dragId: DRAG_ID }),
    );
  });

  it("active drag の cancel 後はサーバー確定位置の note:updated へ戻る", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));
    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      });
      result.current.moveNote(NOTE_ID, 200, 300);
      result.current.cancelNoteDrag(NOTE_ID);
    });
    expect(result.current.notes[0]).toMatchObject({ x: 200, y: 300 });

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: buildNote({ id: NOTE_ID, x: 150, y: 160 }),
      }),
    );

    expect(result.current.notes[0]).toMatchObject({ x: 150, y: 160 });
  });

  it("受理済みの共有付箋を非公開に戻すと旧操作を局所終了し、後着応答を無視して次の付箋を開始できる", () => {
    const nextDragId = vi
      .fn<() => string>()
      .mockReturnValueOnce(DRAG_ID)
      .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const { result } = renderHook(() =>
      useRoomNotes({ send, createNoteDragId: nextDragId }),
    );
    act(() =>
      result.current.applyMessage(
        snapshotMessage([
          buildNote({ id: NOTE_ID }),
          buildNote({ id: TARGET_NOTE_ID }),
        ]),
      ),
    );

    act(() => {
      result.current.startNoteDrag(NOTE_ID);
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      });
      result.current.moveNote(NOTE_ID, 200, 300);
      result.current.unpublishNote(NOTE_ID);
    });

    expect(result.current.draggingNoteId).toBeNull();
    expect(send).toHaveBeenLastCalledWith({
      type: "note:unpublish",
      noteId: NOTE_ID,
    });
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "note:drag:end", dragId: DRAG_ID }),
    );

    act(() => {
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      });
      result.current.startNoteDrag(TARGET_NOTE_ID);
    });

    expect(send).toHaveBeenLastCalledWith({
      type: "note:drag:start",
      noteId: TARGET_NOTE_ID,
      dragId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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

  it("changeNoteFontSize は操作ID付きで楽観更新し、拒否時は確定値へ戻す", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => result.current.changeNoteFontSize(NOTE_ID, 24));

    expect(result.current.notes[0]?.fontSize).toBe(24);
    expect(send).toHaveBeenCalledWith({
      type: "note:update-font-size",
      noteId: NOTE_ID,
      fontSize: 24,
      operationId: FONT_SIZE_OPERATION_ID,
    });

    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "この操作を行う権限がありません。",
        operationId: FONT_SIZE_OPERATION_ID,
      }),
    );

    expect(result.current.notes[0]?.fontSize).toBe(14);
  });

  it.each([
    11,
    12.5,
    25,
    Number.POSITIVE_INFINITY,
  ])("不正な文字サイズ %s は楽観表示もRoomDOへの送信もしない", (fontSize) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => result.current.changeNoteFontSize(NOTE_ID, fontSize));

    expect(result.current.notes[0]?.fontSize).toBe(14);
    expect(send).not.toHaveBeenCalled();
  });

  it("連続した文字サイズ変更は途中応答で巻き戻さず、最後の拒否で確定値へ戻す", () => {
    const operationIds = [
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ];
    const { result } = setup(() => operationIds.shift() ?? "");
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.changeNoteFontSize(NOTE_ID, 15);
      result.current.changeNoteFontSize(NOTE_ID, 16);
    });

    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "この操作を行う権限がありません。",
        operationId: "55555555-5555-4555-8555-555555555555",
      }),
    );
    expect(result.current.notes[0]?.fontSize).toBe(16);

    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "この操作を行う権限がありません。",
        operationId: "66666666-6666-4666-8666-666666666666",
      }),
    );
    expect(result.current.notes[0]?.fontSize).toBe(14);
  });

  it("連続した文字サイズ変更は先の確定応答より最新の楽観値を優先する", () => {
    const operationIds = [
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ];
    const { result } = setup(() => operationIds.shift() ?? "");
    act(() => result.current.applyMessage(snapshotMessage()));

    act(() => {
      result.current.changeNoteFontSize(NOTE_ID, 15);
      result.current.changeNoteFontSize(NOTE_ID, 16);
    });

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: buildNote({ id: NOTE_ID, fontSize: 15 }),
        operationId: "55555555-5555-4555-8555-555555555555",
      }),
    );
    expect(result.current.notes[0]?.fontSize).toBe(16);

    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: buildNote({ id: NOTE_ID, fontSize: 16 }),
        operationId: "66666666-6666-4666-8666-666666666666",
      }),
    );
    expect(result.current.notes[0]?.fontSize).toBe(16);
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

  it("自分のシール削除は残票を楽観的に戻し、操作ID付き拒否でシールと票数を復元する", () => {
    const { result } = setup();
    const voted = buildNote({
      id: NOTE_ID,
      dotVotes: {
        subjective: { count: 0, votedByMe: false, ownCount: 0 },
        objective: { count: 2, votedByMe: true, ownCount: 1 },
      },
      dotVoteStickers: [{ id: STICKER_ID, kind: "objective", x: 0.2, y: 0.3 }],
    });
    act(() => result.current.applyMessage(snapshotMessage([voted])));

    act(() => result.current.removeVoteSticker(STICKER_ID));

    expect(result.current.notes[0]?.dotVotes.objective).toEqual({
      count: 1,
      votedByMe: false,
      ownCount: 0,
    });
    expect(result.current.notes[0]?.dotVoteStickers).toEqual([]);
    expect(send).toHaveBeenCalledWith({
      type: "note:vote-sticker:remove",
      stickerId: STICKER_ID,
      operationId: "33333333-3333-4333-8333-333333333333",
    });

    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "forbidden",
        message: "このシールは取り消せません。",
        operationId: "33333333-3333-4333-8333-333333333333",
      }),
    );

    expect(result.current.pendingVoteOperations).toEqual([]);
    expect(result.current.notes[0]?.dotVotes.objective).toEqual({
      count: 2,
      votedByMe: true,
      ownCount: 1,
    });
    expect(result.current.notes[0]?.dotVoteStickers).toEqual([
      { id: STICKER_ID, kind: "objective", x: 0.2, y: 0.3 },
    ]);
    expect(result.current.voteFeedback).toEqual({
      state: "failed",
      message: "このシールは取り消せません。",
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
