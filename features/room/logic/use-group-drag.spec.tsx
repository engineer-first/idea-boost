import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { calculateRenderGroups } from "@/contracts/grouping";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ClientMessage, GroupDragFrame } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useGroupDrag } from "./use-group-drag";

const notes = [
  buildNote({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", x: 100, y: 100 }),
  buildNote({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", x: 360, y: 120 }),
];
const group = calculateRenderGroups(notes, [])[0] as GroupDragFrame;
const remoteDragId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
/** ドラッグの画面座標とポインター状態を持つテストイベントを作る。 */
function event(x: number, y: number): ReactPointerEvent<HTMLDivElement> {
  return {
    pointerId: 1,
    clientX: x,
    clientY: y,
    buttons: 1,
    preventDefault: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLDivElement>;
}
/** カメラ座標の変換と送信を観測できる一括移動hookのテスト環境を作る。 */
function setup(zoom = 1) {
  const send = vi.fn<(message: ClientMessage) => void>();
  const lockCamera = vi.fn();
  const onRejected = vi.fn();
  const viewport = document.createElement("div");
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 1000,
  } as DOMRect);
  const { result } = renderHook(() =>
    useGroupDrag({
      notes,
      enabled: true,
      send,
      lockCamera,
      onRejected,
      viewportRef: { current: viewport },
      worldPointFromClient: (x, y) => ({ x: x / zoom, y: y / zoom }),
    }),
  );
  /** 背景の移動を開始し、サーバーへ送った操作IDを後続の応答に使えるように返す。 */
  function start() {
    act(() => result.current.start(group, event(110, 110), { x: 100, y: 100 }));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "group:drag:start")
      throw new Error("開始要求がありません");
    return request.dragId;
  }
  return { result, send, lockCamera, onRejected, start };
}

describe("一括ドラッグの表示と開始待ち", () => {
  it("snapshotから移動中の枠と対象を復元する", () => {
    const { result } = setup();
    act(() =>
      result.current.applyMessage({
        type: "snapshot",
        notes,
        members: [],
        phase: buildPhaseStep(3),
        phaseRevision: 0,
        isHost: false,
        decision: null,
        carryovers: [],
        completedVoterIds: [],
        timer: { status: "idle" },
        serverNow: 0,
        groupDrags: [
          {
            dragId: remoteDragId,
            sequence: 2,
            group,
            noteIds: notes.map(({ id }) => id),
          },
        ],
      }),
    );
    expect(result.current.movingGroups).toEqual([
      { dragId: remoteDragId, group, noteIds: notes.map(({ id }) => id) },
    ]);
  });
  it("開始の受理を待って全対象を動かし、ズームを反映した同じ差分を送る", () => {
    const { result, send, start } = setup(2);
    const dragId = start();
    expect(result.current.renderedNotes).toEqual(notes);
    act(() =>
      result.current.applyMessage({
        type: "group:drag:result",
        dragId,
        accepted: true,
      }),
    );
    act(() => result.current.move(event(200, 160)));
    expect(result.current.renderedNotes.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 150, y: 130 },
      { x: 410, y: 150 },
    ]);
    act(() => result.current.end(event(200, 160)));
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "group:drag:end",
      delta: { x: 50, y: 30 },
    });
  });

  it("開始応答前に終了した操作を、遅い受理応答で復活させない", () => {
    const { result, send, lockCamera, start } = setup();
    const dragId = start();
    act(() => result.current.end(event(200, 160)));
    act(() =>
      result.current.applyMessage({
        type: "group:drag:result",
        dragId,
        accepted: true,
      }),
    );
    expect(result.current.isDragging).toBe(false);
    expect(result.current.renderedNotes).toEqual(notes);
    expect(send.mock.calls.map(([message]) => message.type)).toEqual([
      "group:drag:start",
      "group:drag:end",
    ]);
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({ delta: null });
    expect(lockCamera).toHaveBeenLastCalledWith(false);
  });

  it.each([
    false,
    true,
  ])("拒否・無効化では移動を解除し、理由を案内する（受理済み: %s）", (accepted) => {
    const { result, onRejected, lockCamera, send, start } = setup();
    const dragId = start();
    if (accepted)
      act(() =>
        result.current.applyMessage({
          type: "group:drag:result",
          dragId,
          accepted: true,
        }),
      );
    act(() =>
      result.current.applyMessage({
        type: "group:drag:result",
        dragId,
        accepted: false,
      }),
    );
    expect(result.current.renderedNotes).toEqual(notes);
    expect(result.current.isDragging).toBe(false);
    expect(onRejected).toHaveBeenCalledOnce();
    expect(lockCamera).toHaveBeenLastCalledWith(false);
    expect(
      send.mock.calls.some(([message]) => message.type === "group:drag:end"),
    ).toBe(false);
  });

  it.each([
    false,
    true,
  ])("別操作のエラーでは移動とカメラ固定を維持する（開始受理済み: %s）", (accepted) => {
    const { result, send, lockCamera, start } = setup();
    const dragId = start();
    if (accepted)
      act(() =>
        result.current.applyMessage({
          type: "group:drag:result",
          dragId,
          accepted: true,
        }),
      );
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "invalid-message",
        message: "別の付箋の操作が拒否されました。",
        operationId: remoteDragId,
      }),
    );
    expect(result.current.isDragging).toBe(true);
    expect(lockCamera).toHaveBeenLastCalledWith(true);
    expect(
      send.mock.calls.some(([message]) => message.type === "group:drag:end"),
    ).toBe(false);
  });

  it.each([
    false,
    true,
  ])("操作IDのないエラーでは移動を終了してカメラ固定を解除する（開始受理済み: %s）", (accepted) => {
    const { result, send, lockCamera, start } = setup();
    const dragId = start();
    if (accepted)
      act(() =>
        result.current.applyMessage({
          type: "group:drag:result",
          dragId,
          accepted: true,
        }),
      );
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "invalid-message",
        message: "グループの移動を保存できませんでした。",
      }),
    );
    expect(result.current.isDragging).toBe(false);
    expect(lockCamera).toHaveBeenLastCalledWith(false);
    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "group:drag:end",
      dragId,
      delta: null,
    });
  });

  it("終了済み操作の遅い更新・重複した終了通知を再適用しない", () => {
    const { result } = setup();
    const update = {
      type: "group:drag:updated" as const,
      dragId: remoteDragId,
      sequence: 2,
      group,
      notes,
      ended: true,
    };
    act(() => expect(result.current.applyMessage(update)).toBe(true));
    act(() =>
      expect(
        result.current.applyMessage({ ...update, ended: false, sequence: 1 }),
      ).toBe(false),
    );
    act(() => expect(result.current.applyMessage(update)).toBe(false));
  });

  it("対象無効化の結果通知だけで閲覧中の枠を終了し、遅い更新を拒否する", () => {
    const { result } = setup();
    const update = {
      type: "group:drag:updated" as const,
      dragId: remoteDragId,
      sequence: 2,
      group,
      notes,
      ended: false,
    };
    act(() => result.current.applyMessage(update));
    expect(result.current.movingGroups).toHaveLength(1);
    act(() =>
      result.current.applyMessage({
        type: "group:drag:result",
        dragId: remoteDragId,
        accepted: false,
      }),
    );
    expect(result.current.movingGroups).toEqual([]);
    act(() =>
      expect(result.current.applyMessage({ ...update, sequence: 3 })).toBe(
        false,
      ),
    );
  });

  it("自分の開始が拒否されても、別参加者の独立した移動枠を消さない", () => {
    const { result, start } = setup();
    act(() =>
      result.current.applyMessage({
        type: "group:drag:updated",
        dragId: remoteDragId,
        sequence: 0,
        group,
        notes,
        ended: false,
      }),
    );
    const dragId = start();
    act(() =>
      result.current.applyMessage({
        type: "group:drag:result",
        dragId,
        accepted: false,
      }),
    );
    expect(result.current.movingGroups.map(({ dragId: id }) => id)).toEqual([
      remoteDragId,
    ]);
  });
});
