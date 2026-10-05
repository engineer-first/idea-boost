import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MoveReceipt } from "@/contracts/room-protocol";
import { buildGroup, buildNote } from "@/contracts/room-protocol.fixture";
import { useMoveHistory } from "./use-move-history";

const receipt = (id: string, from: number, to: number): MoveReceipt => ({
  operationId: id,
  phaseRevision: 1,
  coordinateSpace: "canvas",
  before: [
    {
      noteId: "note",
      positionRevision: from,
      visibilityRevision: 0,
      x: from,
      y: 0,
    },
  ],
  after: [
    {
      noteId: "note",
      positionRevision: to,
      visibilityRevision: 0,
      x: to,
      y: 0,
    },
  ],
  groupsBefore: [],
  groupsAfter: [],
  groupRevisionBefore: 0,
  groupRevisionAfter: 0,
  mapRevision: 0,
  affected: [{ noteId: "note", positionRevision: to, visibilityRevision: 0 }],
  changed: from !== to,
});
function setup() {
  const send = vi.fn();
  const hook = renderHook(() =>
    useMoveHistory({
      send,
      connected: true,
      blocked: false,
      createId: () => "inverse",
    }),
  );
  const accept = (r: MoveReceipt) =>
    act(() => {
      hook.result.current.observeOutgoing({
        type: "note:move:start",
        operationId: r.operationId,
        expectedPhaseRevision: 1,
        expectedGroupRevision: 0,
        expectedMapRevision: 0,
        coordinateSpace: "canvas",
        targets: r.before,
      });
      hook.result.current.applyMessage({
        type: "note:move:result",
        operationId: r.operationId,
        status: "accepted",
        receipt: r,
      });
    });
  return { ...hook, send, accept };
}
describe("移動履歴", () => {
  it.each([
    "undo",
    "redo",
  ] as const)("%sの未送信が確定したらpendingを解除し同じ履歴を再試行できる", (direction) => {
    const { result, send, accept } = setup();
    accept(receipt("move", 0, 1));
    if (direction === "redo") {
      act(() => result.current.undo());
      act(() =>
        result.current.applyMessage({
          type: "note:move:result",
          operationId: "inverse",
          status: "accepted",
          receipt: receipt("inverse", 1, 2),
        }),
      );
    }
    send.mockClear();
    send.mockReturnValueOnce(false);
    act(() => result.current[direction]());
    const unsent = send.mock.calls[0][0];
    expect(result.current.pending).toBe(false);
    expect(result.current[`${direction}State`].disabled).toBe(false);
    act(() => result.current[direction]());
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({
      sourceOperationId: unsent.sourceOperationId,
      expectedTargets: unsent.expectedTargets,
    });
    expect(result.current.pending).toBe(true);
  });
  it("本人の成功移動だけを記録し、pending連打と拒否時の別履歴実行を防ぐ", () => {
    const { result, send, accept } = setup();
    accept(receipt("first", 0, 1));
    accept(receipt("second", 1, 2));
    act(() => {
      result.current.undo();
      result.current.undo();
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    act(() =>
      result.current.applyMessage({
        type: "note:move:result",
        operationId: "inverse",
        status: "rejected",
        reason: "競合",
      }),
    );
    act(() => result.current.undo());
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.undoState.reason).toBe("競合");
  });
  it("remote receipt/zero deltaは記録せず、snapshotは本人履歴を終了する", () => {
    const { result, accept } = setup();
    act(() =>
      result.current.applyMessage({
        type: "note:move:result",
        operationId: "remote",
        status: "accepted",
        receipt: receipt("remote", 0, 1),
      }),
    );
    expect(result.current.undoState.disabled).toBe(true);
    accept(receipt("zero", 0, 0));
    expect(result.current.undoState.disabled).toBe(true);
    accept(receipt("move", 0, 1));
    act(() => result.current.clear("再接続により移動履歴を終了しました。"));
    expect(result.current.undoState.disabled).toBe(true);
  });
});

it("本人batch直後も可視性版変更を見逃さず履歴を無効化する", () => {
  const { result, accept } = setup();
  const saved = receipt("move", 0, 1);
  act(() =>
    result.current.observeOutgoing({
      type: "note:move:start",
      operationId: "move",
      expectedPhaseRevision: 1,
      expectedGroupRevision: 0,
      expectedMapRevision: 0,
      coordinateSpace: "canvas",
      targets: saved.before,
    }),
  );
  act(() =>
    result.current.applyMessage({
      type: "notes:moved",
      operationId: "move",
      notes: [
        buildNote({ id: "note", positionRevision: 1, visibilityRevision: 0 }),
      ],
      groups: [],
      groupRevision: 0,
    }),
  );
  accept(saved);
  act(() =>
    result.current.applyMessage({
      type: "note:updated",
      note: buildNote({
        id: "note",
        positionRevision: 1,
        visibilityRevision: 1,
        visibility: "private",
      }),
    }),
  );
  expect(result.current.undoState.disabled).toBe(true);
});
it("関連groupの変更だけで履歴を無効化する", () => {
  const { result, accept } = setup();
  const saved = receipt("move", 0, 1);
  saved.groupsBefore = [buildGroup()];
  saved.groupsAfter = [buildGroup()];
  accept(saved);
  act(() =>
    result.current.applyMessage({
      type: "group:updated",
      group: buildGroup({ id: "unrelated", name: "別名" }),
      groupRevision: 1,
    }),
  );
  expect(result.current.undoState.disabled).toBe(false);
  act(() =>
    result.current.applyMessage({
      type: "group:updated",
      group: buildGroup({ name: "他者変更" }),
      groupRevision: 2,
    }),
  );
  expect(result.current.undoState.disabled).toBe(true);
});
it("二段Undo/Redoは本人inverse receiptだけで期待版とcursorを追随する", () => {
  const { result, send, accept } = setup();
  accept(receipt("one", 0, 1));
  accept(receipt("two", 1, 2));
  const inverse = (from: number, to: number, x: number) => {
    const r = receipt("inverse", from, to);
    r.after[0].x = x;
    return r;
  };
  act(() => result.current.undo());
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "inverse",
      status: "accepted",
      receipt: inverse(2, 3, 1),
    }),
  );
  act(() => result.current.undo());
  expect(send.mock.calls[1][0]).toMatchObject({
    sourceOperationId: "one",
    expectedTargets: [{ positionRevision: 3 }],
  });
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "inverse",
      status: "accepted",
      receipt: inverse(3, 4, 0),
    }),
  );
  expect(result.current.undoState.disabled).toBe(true);
  act(() => result.current.redo());
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "inverse",
      status: "accepted",
      receipt: inverse(4, 5, 1),
    }),
  );
  act(() => result.current.redo());
  expect(send.mock.calls[3][0]).toMatchObject({
    sourceOperationId: "inverse",
    expectedTargets: [{ positionRevision: 5 }],
  });
});
it("本人の二回目move batchとnote echoで古い履歴を競合扱いしない", () => {
  const { result, accept } = setup();
  accept(receipt("first", 0, 1));
  const saved = receipt("second", 1, 2);
  act(() =>
    result.current.observeOutgoing({
      type: "note:move:start",
      operationId: "second",
      expectedPhaseRevision: 1,
      expectedGroupRevision: 0,
      expectedMapRevision: 0,
      coordinateSpace: "canvas",
      targets: saved.before,
    }),
  );
  const note = buildNote({
    id: "note",
    positionRevision: 2,
    visibilityRevision: 0,
  });
  act(() => {
    result.current.applyMessage({
      type: "notes:moved",
      operationId: "second",
      notes: [note],
      groups: [],
      groupRevision: 0,
    });
    result.current.applyMessage({ type: "note:updated", note });
  });
  accept(saved);
  act(() => result.current.undo());
  const undo = receipt("inverse", 2, 3);
  undo.after[0].x = 1;
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "inverse",
      status: "accepted",
      receipt: undo,
    }),
  );
  expect(result.current.undoState.disabled).toBe(false);
});
it("結果不明は同じinverseのstatus照会を続けcursorを進めない", () => {
  vi.useFakeTimers();
  const { result, send, accept, unmount } = setup();
  accept(receipt("move", 0, 1));
  act(() => result.current.undo());
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "inverse",
      status: "unknown",
    }),
  );
  expect(result.current.pending).toBe(true);
  expect(result.current.redoState.disabled).toBe(true);
  act(() => vi.advanceTimersByTime(2000));
  expect(send).toHaveBeenLastCalledWith({
    type: "note:move:status",
    operationId: "inverse",
  });
  unmount();
  vi.useRealTimers();
});
it("共有/非共有化と本文・票の成功だけを境界にし拒否要求を残さない", () => {
  const { result, accept } = setup();
  accept(receipt("move", 0, 1));
  act(() => {
    result.current.observeOutgoing({ type: "note:unpublish", noteId: "note" });
    result.current.applyMessage({
      type: "error",
      code: "forbidden",
      message: "拒否",
    });
    result.current.applyMessage({
      type: "note:updated",
      note: buildNote({
        id: "note",
        positionRevision: 1,
        visibilityRevision: 0,
      }),
    });
  });
  expect(result.current.undoState.disabled).toBe(false);
  act(() => {
    result.current.observeOutgoing({
      type: "note:publish",
      noteId: "other",
      x: 0,
      y: 0,
    });
    result.current.applyMessage({
      type: "note:updated",
      note: buildNote({ id: "other", visibility: "shared" }),
    });
  });
  expect(result.current.undoState.disabled).toBe(true);
  accept(receipt("move2", 1, 2));
  act(() => {
    result.current.observeOutgoing({
      type: "note:vote",
      noteId: "note",
      kind: "subjective",
      operationId: "vote",
    });
    result.current.applyMessage({
      type: "error",
      operationId: "vote",
      code: "forbidden",
      message: "拒否",
    });
    result.current.applyMessage({
      type: "note:updated",
      operationId: "vote",
      note: buildNote({
        id: "note",
        positionRevision: 2,
        visibilityRevision: 0,
      }),
    });
  });
  expect(result.current.undoState.disabled).toBe(false);
  act(() => {
    result.current.observeOutgoing({
      type: "note:update-content",
      noteId: "note",
      content: "本文",
      operationId: "content",
      expectedContentRevision: 0,
      expectedPhaseRevision: 1,
    });
    result.current.applyMessage({
      type: "note:content-saved",
      operationId: "content",
      noteId: "note",
      contentRevision: 1,
    });
  });
  expect(result.current.undoState.disabled).toBe(true);
});
it("再接続や対象外成功境界後に遅延move receiptで履歴を復活させない", () => {
  const { result } = setup();
  const saved = receipt("pending", 0, 1);
  act(() =>
    result.current.observeOutgoing({
      type: "note:move:start",
      operationId: "pending",
      expectedPhaseRevision: 1,
      expectedGroupRevision: 0,
      expectedMapRevision: 0,
      coordinateSpace: "canvas",
      targets: saved.before,
    }),
  );
  act(() => result.current.clear());
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "pending",
      status: "accepted",
      receipt: saved,
    }),
  );
  expect(result.current.undoState.disabled).toBe(true);
});
it("工程/再接続境界は結果不明inverseを履歴から外し新しい履歴を妨げない", () => {
  const { result, accept, send } = setup();
  accept(receipt("old", 0, 1));
  act(() => result.current.undo());
  act(() => result.current.clear());
  expect(result.current.pending).toBe(false);
  accept(receipt("new", 1, 2));
  expect(result.current.undoState.disabled).toBe(false);
  const late = receipt("inverse", 1, 3);
  late.after[0].x = 0;
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "inverse",
      status: "accepted",
      receipt: late,
    }),
  );
  expect(result.current.redoState.disabled).toBe(true);
  act(() => result.current.undo());
  expect(send.mock.calls[1][0]).toMatchObject({ sourceOperationId: "new" });
});
it("共有成功note:insertedだけで移動履歴を区切る", () => {
  const { result, accept } = setup();
  accept(receipt("move", 0, 1));
  act(() => {
    result.current.observeOutgoing({
      type: "note:publish",
      noteId: "private",
      x: 10,
      y: 20,
    });
    result.current.applyMessage({
      type: "note:inserted",
      note: buildNote({ id: "private", visibility: "shared" }),
    });
  });
  expect(result.current.undoState.disabled).toBe(true);
});
it("相関errorだけでは終端にせずstatus unknownで不存在を確認する", () => {
  const { result, accept } = setup();
  accept(receipt("old", 0, 1));
  act(() => result.current.undo());
  act(() =>
    result.current.applyMessage({
      type: "error",
      code: "forbidden",
      operationId: "inverse",
      message: "受理前拒否",
    }),
  );
  expect(result.current.pending).toBe(true);
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "inverse",
      status: "unknown",
    }),
  );
  expect(result.current.pending).toBe(false);
  expect(result.current.undoState.reason).toBe("受理前拒否");
});
it("相関error後も保存済みaccepted receiptなら正しくUndo成功にする", () => {
  const { result, accept } = setup();
  accept(receipt("old", 0, 1));
  act(() => result.current.undo());
  act(() =>
    result.current.applyMessage({
      type: "error",
      code: "forbidden",
      operationId: "inverse",
      message: "再要求の拒否",
    }),
  );
  const saved = receipt("inverse", 1, 2);
  saved.after[0].x = 0;
  act(() =>
    result.current.applyMessage({
      type: "note:move:result",
      operationId: "inverse",
      status: "accepted",
      receipt: saved,
    }),
  );
  expect(result.current.pending).toBe(false);
  expect(result.current.redoState.disabled).toBe(false);
});

it("相関した本文保存のunknownは履歴を残し、確定acceptedだけで境界にする", () => {
  const { result, accept } = setup();
  accept(receipt("move", 0, 1));
  act(() =>
    result.current.observeOutgoing({
      type: "note:update-content",
      noteId: "note",
      content: "本文",
      operationId: "content",
      expectedContentRevision: 0,
      expectedPhaseRevision: 1,
    }),
  );
  act(() =>
    result.current.applyMessage({
      type: "note:content-status-result",
      operationId: "content",
      status: "unknown",
    }),
  );
  expect(result.current.undoState.disabled).toBe(false);
  act(() =>
    result.current.applyMessage({
      type: "note:content-status-result",
      operationId: "content",
      status: "accepted",
      noteId: "note",
      contentRevision: 1,
    }),
  );
  expect(result.current.undoState.disabled).toBe(true);
});
