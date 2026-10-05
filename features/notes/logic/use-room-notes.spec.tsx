// useRoomNotes（付箋の状態とプロトコル化・楽観更新ポリシー）の単体テスト。
// ポリシーの検証に集中する:
// - 移動・本文は楽観更新（操作の追従性優先）
// - 削除は楽観しない（author 以外はサーバーが拒否するため、確定を待つ）
// - 自分がドラッグ中の付箋へのエコーは無視する
// - ドラッグ中の座標はスロットルして送る
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS_COORDINATE_LIMIT,
  DRAG_BROADCAST_THROTTLE_MS,
} from "@/contracts/board";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type {
  MoveReceipt,
  ProtocolNote,
  ServerMessage,
} from "@/contracts/room-protocol";
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
    phaseRevision: 0,
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

  it("peer全件previewは座標だけ表示し取消で最新確定へ戻す", () => {
    const { result } = setup();
    const notes = [
      buildNote({
        id: NOTE_ID,
        x: 100,
        y: 100,
        positionRevision: 0,
        visibilityRevision: 0,
      }),
      buildNote({
        id: TARGET_NOTE_ID,
        x: 200,
        y: 100,
        positionRevision: 0,
        visibilityRevision: 0,
      }),
    ];
    act(() => result.current.applyMessage(snapshotMessage(notes)));
    act(() =>
      result.current.applyMessage({
        type: "notes:move-preview",
        operationId: DRAG_ID,
        userId: FONT_SIZE_OPERATION_ID,
        phaseRevision: 0,
        sequence: 1,
        leaseMs: 15000,
        positions: notes.map((n) => ({
          noteId: n.id,
          x: n.x + 30,
          y: n.y,
          positionRevision: 0,
          visibilityRevision: 0,
        })),
      } as unknown as ServerMessage),
    );
    expect(result.current.notes.map((n) => n.x)).toEqual([130, 230]);
    act(() =>
      result.current.applyMessage({
        type: "notes:move-ended",
        operationId: DRAG_ID,
      } as unknown as ServerMessage),
    );
    expect(result.current.notes.map((n) => n.x)).toEqual([100, 200]);
  });
  it("古いpeer previewと終了は新previewや新確定を巻き戻さず本文更新を保つ", () => {
    const { result } = setup();
    const note = buildNote({
      id: NOTE_ID,
      x: 100,
      y: 100,
      positionRevision: 0,
      visibilityRevision: 0,
    });
    const preview = (
      operationId: string,
      sequence: number,
      x: number,
      positionRevision = 0,
    ): ServerMessage => ({
      type: "notes:move-preview",
      operationId,
      userId: FONT_SIZE_OPERATION_ID,
      phaseRevision: 0,
      sequence,
      leaseMs: 15000,
      positions: [
        { noteId: NOTE_ID, x, y: 100, positionRevision, visibilityRevision: 0 },
      ],
    });
    act(() => result.current.applyMessage(snapshotMessage([note])));
    act(() => result.current.applyMessage(preview(DRAG_ID, 2, 140)));
    act(() => result.current.applyMessage(preview(DRAG_ID, 1, 110)));
    expect(result.current.notes[0].x).toBe(140);
    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: { ...note, content: "new body", contentRevision: 1 },
      }),
    );
    expect(result.current.notes[0]).toMatchObject({
      x: 140,
      content: "new body",
    });
    act(() => result.current.applyMessage(preview(STICKER_ID, 3, 160)));
    act(() =>
      result.current.applyMessage({
        type: "notes:move-ended",
        operationId: DRAG_ID,
      }),
    );
    act(() => result.current.applyMessage(preview(DRAG_ID, 4, 120)));
    expect(result.current.notes[0].x).toBe(160);
    act(() =>
      result.current.applyMessage({
        type: "notes:moved",
        operationId: STICKER_ID,
        notes: [{ ...note, x: 180, positionRevision: 1, content: "new body" }],
        groups: [],
        groupRevision: 0,
      }),
    );
    expect(result.current.notes[0].x).toBe(180);
    act(() =>
      result.current.applyMessage({
        type: "notes:move-ended",
        operationId: STICKER_ID,
      }),
    );
    act(() => result.current.applyMessage(preview(STICKER_ID, 4, 160)));
    act(() =>
      result.current.applyMessage(preview(FONT_SIZE_OPERATION_ID, 5, 200)),
    );
    expect(result.current.notes[0]).toMatchObject({
      x: 180,
      content: "new body",
    });
  });
  it.each([
    "expiry",
    "disconnect",
    "snapshot",
    "phase",
    "member",
    "adoption",
  ])("peer overlayは%sで全件消える", (reason) => {
    const { result } = setup();
    const note = buildNote({
      id: NOTE_ID,
      x: 100,
      y: 100,
      positionRevision: 0,
      visibilityRevision: 0,
    });
    act(() => result.current.applyMessage(snapshotMessage([note])));
    act(() =>
      result.current.applyMessage({
        type: "notes:move-preview",
        operationId: DRAG_ID,
        userId: FONT_SIZE_OPERATION_ID,
        phaseRevision: 0,
        sequence: 1,
        leaseMs: 15000,
        positions: [
          {
            noteId: NOTE_ID,
            x: 150,
            y: 100,
            positionRevision: 0,
            visibilityRevision: 0,
          },
        ],
      }),
    );
    expect(result.current.notes[0].x).toBe(150);
    act(() => {
      if (reason === "expiry") vi.advanceTimersByTime(15000);
      if (reason === "disconnect") result.current.clearPeerMoves();
      if (reason === "snapshot")
        result.current.applyMessage(snapshotMessage([note]));
      if (reason === "phase")
        result.current.applyMessage({
          type: "phase:updated",
          phase: buildPhaseStep(1, 3),
          phaseRevision: 1,
        });
      if (reason === "member")
        result.current.applyMessage({
          type: "member_left",
          userId: FONT_SIZE_OPERATION_ID,
        });
      if (reason === "adoption")
        result.current.applyMessage({
          type: "decision:updated",
          decision: {
            phase: 1,
            noteId: NOTE_ID,
            decidedBy: FONT_SIZE_OPERATION_ID,
          },
        });
    });
    expect(result.current.notes[0].x).toBe(100);
  });
  it("peerの一対象がprivateまたは新版なら全件を表示しない", () => {
    const { result } = setup();
    const notes = [
      buildNote({
        id: NOTE_ID,
        x: 100,
        y: 100,
        positionRevision: 0,
        visibilityRevision: 0,
      }),
      buildNote({
        id: TARGET_NOTE_ID,
        visibility: "private",
        positionRevision: 0,
        visibilityRevision: 0,
      }),
    ];
    act(() => result.current.applyMessage(snapshotMessage(notes)));
    act(() =>
      result.current.applyMessage({
        type: "notes:move-preview",
        operationId: DRAG_ID,
        userId: FONT_SIZE_OPERATION_ID,
        phaseRevision: 0,
        sequence: 1,
        leaseMs: 15000,
        positions: notes.map((note) => ({
          noteId: note.id,
          x: 500,
          y: 100,
          positionRevision: 0,
          visibilityRevision: 0,
        })),
      }),
    );
    expect(result.current.notes[0].x).toBe(100);
  });
  it("端末時計がsnapshot後に進んでもpeer移動は受信からのlease期間表示する", () => {
    const { result } = setup();
    const note = buildNote({
      id: NOTE_ID,
      x: 100,
      y: 100,
      positionRevision: 0,
      visibilityRevision: 0,
    });
    const serverNow = Date.now();
    act(() => result.current.applyMessage(snapshotMessage([note])));
    vi.setSystemTime(serverNow + 60000);
    act(() =>
      result.current.applyMessage({
        type: "notes:move-preview",
        operationId: DRAG_ID,
        userId: FONT_SIZE_OPERATION_ID,
        phaseRevision: 0,
        sequence: 1,
        leaseUntil: serverNow + 15000,
        leaseMs: 15000,
        positions: [
          {
            noteId: NOTE_ID,
            x: 150,
            y: 100,
            positionRevision: 0,
            visibilityRevision: 0,
          },
        ],
      } as unknown as ServerMessage),
    );
    expect(result.current.notes[0].x).toBe(150);
    act(() => vi.advanceTimersByTime(15000));
    expect(result.current.notes[0].x).toBe(100);
  });
  it("snapshotを適用するたびにsnapshotVersionを進める", () => {
    const { result } = setup();
    expect(result.current.snapshotVersion).toBe(0);

    act(() => result.current.applyMessage(snapshotMessage()));
    expect(result.current.snapshotVersion).toBe(1);

    act(() => result.current.applyMessage(snapshotMessage([])));
    expect(result.current.snapshotVersion).toBe(2);
  });

  it("採用が確定したらドラッグを止め、最後に受理された位置へ揃える", () => {
    const { result } = setup();
    act(() =>
      result.current.applyMessage(
        snapshotMessage([buildNote({ id: NOTE_ID, x: 100, y: 100 })]),
      ),
    );
    act(() => result.current.startNoteDrag(NOTE_ID));
    act(() =>
      result.current.applyMessage({
        type: "note:drag:result",
        dragId: DRAG_ID,
        accepted: true,
      }),
    );
    act(() => result.current.moveNote(NOTE_ID, 150, 150));
    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note: buildNote({ id: NOTE_ID, x: 140, y: 140 }),
      }),
    );
    act(() =>
      result.current.applyMessage({
        type: "decision:updated",
        decision: {
          phase: 1,
          noteId: NOTE_ID,
          decidedBy: "11111111-1111-4111-8111-111111111111",
        },
      }),
    );
    expect(result.current.draggingNoteId).toBeNull();
    expect(result.current.notes[0]).toMatchObject({ x: 140, y: 140 });
  });

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
    expect(result.current.notes[0]).toMatchObject({ x: 100, y: 120 });
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
      result.current.unpublishNote(NOTE_ID, 4, true);
    });
    expect(result.current.draggingNoteId).toBeNull();
    expect(send).toHaveBeenLastCalledWith({
      type: "note:unpublish",
      noteId: NOTE_ID,
      privateIndex: 4,
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

  it("active drag の cancel 直後に元座標へ戻り、後続のサーバー確定位置も反映する", () => {
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
    expect(result.current.notes[0]).toMatchObject({ x: 100, y: 120 });

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

  it.each([
    { action: "add", message: "投票を確定しました。" },
    { action: "remove", message: "投票を1票取り消しました。" },
    { action: "remove-sticker", message: "投票を1票取り消しました。" },
    { action: "move", message: "シールを移動しました。" },
  ] as const)("$action の受理後だけ操作に合った成功状態を示す", ({
    action,
    message,
  }) => {
    const { result } = setup();
    const voted = buildNote({
      id: NOTE_ID,
      dotVotes: {
        subjective: { votedByMe: false, ownCount: 0 },
        objective: { votedByMe: true, ownCount: 1 },
      },
      dotVoteStickers: [{ id: STICKER_ID, kind: "objective", x: 0.2, y: 0.3 }],
    });
    act(() =>
      result.current.applyMessage(
        snapshotMessage([voted, buildNote({ id: TARGET_NOTE_ID })]),
      ),
    );
    act(() => {
      if (action === "add")
        result.current.voteNote(TARGET_NOTE_ID, "objective");
      else if (action === "remove")
        result.current.removeNoteVote(NOTE_ID, "objective");
      else if (action === "remove-sticker")
        result.current.removeVoteSticker(STICKER_ID);
      else result.current.moveVoteSticker(STICKER_ID, TARGET_NOTE_ID, 0.8, 0.9);
    });
    expect(result.current.pendingVoteOperations).toHaveLength(1);
    expect(result.current.voteFeedback).toBeNull();
    const note = result.current.notes.find(
      ({ id }) =>
        id ===
        (action === "add" || action === "move" ? TARGET_NOTE_ID : NOTE_ID),
    );
    if (!note) throw new Error("操作後の付箋が見つかりません");
    act(() =>
      result.current.applyMessage({
        type: "note:updated",
        note,
        operationId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(result.current.pendingVoteOperations).toEqual([]);
    expect(result.current.voteFeedback).toEqual({
      state: "confirmed",
      message,
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

describe("transaction move", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("3-2の共有付箋を戻すときは移動を取消してから非共有化する", () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useRoomNotes({ send, createNoteDragId: () => DRAG_ID }),
    );
    act(() =>
      result.current.applyMessage({
        ...snapshotMessage(),
        phase: { kind: "step", phase: 3, step: 2 },
        moveProtocolVersion: 1,
      } as ServerMessage),
    );
    act(() => result.current.startNoteDrag(NOTE_ID));
    act(() => result.current.moveNote(NOTE_ID, 80, 70));
    send.mockClear();
    act(() => result.current.unpublishNote(NOTE_ID, 4, true));
    expect(send.mock.calls.map(([message]) => message)).toEqual([
      { type: "note:move:cancel", operationId: DRAG_ID },
      { type: "note:unpublish", noteId: NOTE_ID, privateIndex: 4 },
    ]);
    expect(result.current.draggingNoteId).toBeNull();
    act(() => vi.advanceTimersByTime(2_000));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("分類の内容を含まない版通知でpreviewを取消し次の移動を最新の版で開始する", () => {
    const send = vi.fn();
    const { result } = renderHook(() => useRoomNotes({ send }));
    act(() =>
      result.current.applyMessage({
        ...snapshotMessage(),
        moveProtocolVersion: 1,
        groupRevision: 2,
      } as ServerMessage),
    );
    act(() => result.current.startNoteDrag(NOTE_ID));
    act(() => result.current.moveNote(NOTE_ID, 130, 100));
    act(() =>
      result.current.applyMessage({
        type: "group:revision",
        groupRevision: 3,
      }),
    );
    expect(result.current.draggingNoteId).toBeNull();
    act(() => result.current.startNoteDrag(NOTE_ID));
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:start",
      expectedGroupRevision: 3,
    });
  });
  it("start ACKより前に3枚を同じdeltaでpreviewしmap端でも距離を保つ", () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useRoomNotes({ send, createNoteDragId: () => DRAG_ID }),
    );
    const snapshot = snapshotMessage([
      buildNote({ id: NOTE_ID, x: 80, y: 30 }),
      buildNote({ id: TARGET_NOTE_ID, x: 90, y: 50 }),
      buildNote({ id: STICKER_ID, x: 95, y: 60 }),
    ]);
    act(() =>
      result.current.applyMessage({
        ...snapshot,
        phase: { kind: "step", phase: 3, step: 3 },
        moveProtocolVersion: 1,
        groupRevision: 0,
        mapRevision: 0,
      } as ServerMessage),
    );
    act(() =>
      result.current.startNoteDrag(NOTE_ID, false, [
        NOTE_ID,
        TARGET_NOTE_ID,
        STICKER_ID,
      ]),
    );
    act(() => result.current.moveNote(NOTE_ID, 100, 50));
    act(() => vi.advanceTimersByTime(20));
    expect(result.current.notes.map((n) => [n.x, n.y])).toEqual([
      [85, 50],
      [95, 70],
      [100, 80],
    ]);
    expect(
      send.mock.calls.some(([message]) => message.type === "note:move:commit"),
    ).toBe(false);
    act(() => result.current.endNoteDrag(NOTE_ID, 100, 50));
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:commit",
      operationId: DRAG_ID,
      delta: { x: 5, y: 20 },
    });
  });
  it("cancelで最新確定位置へ戻り遅延start ACKでcommitしない", () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useRoomNotes({ send, createNoteDragId: () => DRAG_ID }),
    );
    act(() =>
      result.current.applyMessage({
        ...snapshotMessage(),
        moveProtocolVersion: 1,
        groupRevision: 0,
        mapRevision: 0,
      } as ServerMessage),
    );
    act(() => result.current.startNoteDrag(NOTE_ID));
    act(() => result.current.moveNote(NOTE_ID, 150, 140));
    act(() => result.current.cancelNoteDrag());
    act(() =>
      result.current.applyMessage({
        type: "note:move:result",
        operationId: DRAG_ID,
        status: "active",
      } as ServerMessage),
    );
    expect(result.current.notes[0].x).toBe(100);
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:cancel",
    });
  });
});

describe("commit結果不明の回復", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("pointerup後の遅延start ACKとerrorでcommitを再送せず照会を継続する", () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useRoomNotes({ send, createNoteDragId: () => DRAG_ID }),
    );
    act(() =>
      result.current.applyMessage({
        ...snapshotMessage(),
        moveProtocolVersion: 1,
        groupRevision: 0,
        mapRevision: 0,
      } as ServerMessage),
    );
    act(() => result.current.startNoteDrag(NOTE_ID));
    act(() => result.current.endNoteDrag(NOTE_ID, 150, 140));
    act(() =>
      result.current.applyMessage({
        type: "note:move:result",
        operationId: DRAG_ID,
        status: "active",
      }),
    );
    expect(
      send.mock.calls.filter(
        ([message]) => message.type === "note:move:commit",
      ),
    ).toHaveLength(1);
    send.mockClear();
    for (let i = 0; i < 10; i++)
      act(() =>
        result.current.applyMessage({
          type: "error",
          code: "invalid-message",
          operationId: DRAG_ID,
          message: "応答失敗",
        }),
      );
    expect(result.current.movePending).toBe(true);
    expect(send).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2000));
    expect(send.mock.calls).toHaveLength(1);
    expect(send.mock.calls[0][0]).toMatchObject({ type: "note:move:status" });
    act(() =>
      result.current.applyMessage({
        type: "note:move:result",
        operationId: DRAG_ID,
        status: "unknown",
      }),
    );
    expect(result.current.movePending).toBe(false);
  });
  it("map版変更でpreviewを全取消し次の操作の期待版を更新する", () => {
    const send = vi.fn();
    const { result } = renderHook(() =>
      useRoomNotes({ send, createNoteDragId: () => DRAG_ID }),
    );
    act(() =>
      result.current.applyMessage({
        ...snapshotMessage(),
        phase: { kind: "step", phase: 3, step: 3 },
        moveProtocolVersion: 1,
        groupRevision: 0,
        mapRevision: 1,
      } as ServerMessage),
    );
    act(() => result.current.startNoteDrag(NOTE_ID));
    act(() =>
      result.current.applyMessage({
        type: "idea-map:state",
        mapRevision: 2,
        sizeLevel: 2,
        initialized: true,
        isDragging: false,
      }),
    );
    expect(result.current.draggingNoteId).toBe(null);
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:cancel",
    });
    act(() => result.current.startNoteDrag(NOTE_ID));
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "note:move:start",
      expectedMapRevision: 2,
    });
  });
});

it("canvas両端の集合previewとcommit deltaを位置域へclampする", () => {
  const send = vi.fn();
  const { result } = renderHook(() =>
    useRoomNotes({ send, createNoteDragId: () => DRAG_ID }),
  );
  act(() =>
    result.current.applyMessage({
      ...snapshotMessage([
        buildNote({ id: NOTE_ID, x: -CANVAS_COORDINATE_LIMIT, y: 100 }),
        buildNote({
          id: TARGET_NOTE_ID,
          x: -CANVAS_COORDINATE_LIMIT + 40,
          y: 100,
        }),
      ]),
      moveProtocolVersion: 1,
      groupRevision: 0,
      mapRevision: 0,
    } as ServerMessage),
  );
  act(() =>
    result.current.startNoteDrag(NOTE_ID, false, [NOTE_ID, TARGET_NOTE_ID]),
  );
  act(() => result.current.endNoteDrag(NOTE_ID, CANVAS_COORDINATE_LIMIT, 100));
  expect(result.current.notes.map((n) => n.x)).toEqual([
    CANVAS_COORDINATE_LIMIT - 40,
    CANVAS_COORDINATE_LIMIT,
  ]);
  expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
    type: "note:move:commit",
    delta: { x: 2 * CANVAS_COORDINATE_LIMIT - 40, y: 0 },
  });
});

it("成功receiptが不可視で伏せられても成功済みのmoveを失敗表示しない", () => {
  const send = vi.fn();
  const { result } = renderHook(() =>
    useRoomNotes({ send, createNoteDragId: () => DRAG_ID }),
  );
  act(() =>
    result.current.applyMessage({
      ...snapshotMessage(),
      moveProtocolVersion: 1,
      groupRevision: 0,
      mapRevision: 0,
    } as ServerMessage),
  );
  act(() => result.current.startNoteDrag(NOTE_ID));
  act(() => result.current.endNoteDrag(NOTE_ID, 150, 140));
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: DRAG_ID,
      status: "accepted",
    }),
  );
  expect(result.current.movePending).toBe(false);
  expect(result.current.moveFeedback).toBe(null);
  expect(result.current.lastMoveReceipt).toBe(null);
});

function successfulMoveReceipt(operationId = DRAG_ID): MoveReceipt {
  return {
    operationId,
    phaseRevision: 0,
    coordinateSpace: "canvas",
    changed: true,
    before: [
      {
        noteId: NOTE_ID,
        x: 100,
        y: 120,
        positionRevision: 0,
        visibilityRevision: 0,
      },
    ],
    after: [
      {
        noteId: NOTE_ID,
        x: 150,
        y: 140,
        positionRevision: 1,
        visibilityRevision: 0,
      },
    ],
    groupsBefore: [],
    groupsAfter: [],
    groupRevisionBefore: 0,
    groupRevisionAfter: 0,
    mapRevision: 0,
    affected: [{ noteId: NOTE_ID, positionRevision: 1, visibilityRevision: 0 }],
  };
}
it("成功receiptを伏せた新操作が古い成功receiptを最後の逆操作情報として公開しない", () => {
  const send = vi.fn();
  const ids = [DRAG_ID, FONT_SIZE_OPERATION_ID];
  const { result } = renderHook(() =>
    useRoomNotes({ send, createNoteDragId: () => ids.shift() ?? DRAG_ID }),
  );
  act(() =>
    result.current.applyMessage({
      ...snapshotMessage(),
      moveProtocolVersion: 1,
      groupRevision: 0,
      mapRevision: 0,
    } as ServerMessage),
  );
  act(() => result.current.startNoteDrag(NOTE_ID));
  act(() => result.current.endNoteDrag(NOTE_ID, 150, 140));
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: DRAG_ID,
      status: "accepted",
      receipt: successfulMoveReceipt(),
    }),
  );
  expect(result.current.lastMoveReceipt?.operationId).toBe(DRAG_ID);
  act(() => result.current.startNoteDrag(NOTE_ID));
  act(() => result.current.endNoteDrag(NOTE_ID, 180, 160));
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: FONT_SIZE_OPERATION_ID,
      status: "accepted",
    }),
  );
  expect(result.current.lastMoveReceipt).toBe(null);
  expect(result.current.moveFeedback).toBe(null);
});
it("旧serverで固定複数集合を開始せず新旧commitも送らない", () => {
  const send = vi.fn();
  const { result } = renderHook(() => useRoomNotes({ send }));
  act(() =>
    result.current.applyMessage(
      snapshotMessage([
        buildNote({ id: NOTE_ID }),
        buildNote({ id: TARGET_NOTE_ID }),
      ]),
    ),
  );
  act(() =>
    result.current.startNoteDrag(NOTE_ID, false, [NOTE_ID, TARGET_NOTE_ID]),
  );
  act(() => result.current.moveNote(NOTE_ID, 150, 140));
  act(() => result.current.endNoteDrag(NOTE_ID, 150, 140));
  expect(send).not.toHaveBeenCalled();
  expect(result.current.draggingNoteId).toBe(null);
  expect(result.current.notes[0].x).toBe(100);
});
it.each([
  "position",
  "visibility",
  "phase",
] as const)("遅延成功receiptで%s新版の盤面を戻さない", (kind) => {
  const send = vi.fn();
  const { result } = renderHook(() =>
    useRoomNotes({ send, createNoteDragId: () => DRAG_ID }),
  );
  act(() =>
    result.current.applyMessage({
      ...snapshotMessage(),
      moveProtocolVersion: 1,
      groupRevision: 0,
      mapRevision: 0,
    } as ServerMessage),
  );
  act(() => result.current.startNoteDrag(NOTE_ID));
  act(() => result.current.endNoteDrag(NOTE_ID, 150, 140));
  const latest = buildNote({
    id: NOTE_ID,
    x: 700,
    y: 800,
    positionRevision: kind === "position" ? 2 : 0,
    visibilityRevision: kind === "visibility" ? 1 : 0,
    visibility: kind === "visibility" ? "private" : "shared",
  });
  act(() =>
    result.current.applyMessage({
      ...snapshotMessage([latest]),
      moveProtocolVersion: 1,
      groupRevision: 0,
      mapRevision: 0,
      phaseRevision: kind === "phase" ? 1 : 0,
      phase: kind === "phase" ? buildPhaseStep(2, 2) : buildPhaseStep(1),
    } as ServerMessage),
  );
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: DRAG_ID,
      status: "accepted",
      receipt: successfulMoveReceipt(),
    }),
  );
  expect(result.current.notes[0]).toMatchObject({
    x: 700,
    y: 800,
    visibility: latest.visibility,
    positionRevision: latest.positionRevision,
    visibilityRevision: latest.visibilityRevision,
  });
  expect(result.current.movePending).toBe(false);
});
