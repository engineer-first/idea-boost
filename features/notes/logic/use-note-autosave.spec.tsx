import { act, renderHook } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { useNoteAutosave } from "./use-note-autosave";

const noteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "11111111-1111-4111-8111-111111111111";
const note = buildNote({
  id: noteId,
  authorId: userId,
  content: "原文",
  visibility: "private",
  contentRevision: 0,
});
function snapshot(revision = 0): Extract<ServerMessage, { type: "snapshot" }> {
  return {
    type: "snapshot",
    notes: [{ ...note, contentRevision: revision }],
    members: [],
    phase: buildPhaseStep(1),
    phaseRevision: 2,
    isHost: true,
    decision: null,
    carryovers: [],
    completedVoterIds: [],
    timer: { status: "idle" },
    serverNow: Date.now(),
  };
}

describe("useNoteAutosave", () => {
  const send = vi.fn<(message: ClientMessage) => boolean>(() => true);
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    send.mockClear();
  });
  afterEach(() => vi.useRealTimers());
  const setup = () =>
    renderHook(() => useNoteAutosave({ roomId: "room", userId, send }));

  it("個人→共有で未送信本文を待機せず現在の工程の版で保存する", async () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "移行直前の本文"));
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    await act(async () => {});
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "note:update-content",
        content: "移行直前の本文",
        expectedPhaseRevision: 3,
      }),
    );
  });

  it("個人→共有後に古い保存の拒否が届いても受理照会後に新しい要求で継続する", async () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "5秒後にも保存する本文"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: "content-conflict",
        operationId: request.operationId,
        message: "付箋の本文が先に更新されました。",
      }),
    );
    expect(result.current.recoveries).toEqual([]);
    act(() => vi.advanceTimersByTime(5000));
    act(() =>
      result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: "unknown",
      }),
    );
    await act(async () => {});
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "note:update-content",
        content: request.content,
        expectedPhaseRevision: 3,
        operationId: expect.not.stringMatching(request.operationId),
      }),
    );
  });

  it.each([
    "content-version",
    "forbidden",
    "other-author",
    "shared",
    "stage",
    "not-editable",
    "rollback",
    "completed",
    "missing",
    "same-phase-revision",
  ] as const)("古い保存拒否でも%sなら照会・書き込みの再送を継続しない", async (reason) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "端末に残る本文"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() =>
      result.current.applyMessage({
        ...snapshot(reason === "content-version" ? 1 : 0),
        phase:
          reason === "stage"
            ? buildPhaseStep(2, 2)
            : reason === "not-editable"
              ? buildPhaseStep(3)
              : reason === "completed"
                ? buildPhaseStep(5, 3)
                : reason === "same-phase-revision"
                  ? buildPhaseStep(1)
                  : buildPhaseStep(2),
        phaseRevision: reason === "same-phase-revision" ? 2 : 3,
        ...(reason === "rollback" ? { rollbackRevision: 3 } : {}),
        ...(reason === "completed" ? { outcomePublished: true } : {}),
        notes:
          reason === "missing"
            ? []
            : [
                {
                  ...note,
                  contentRevision: reason === "content-version" ? 1 : 0,
                  ...(reason === "other-author"
                    ? { authorId: "22222222-2222-4222-8222-222222222222" }
                    : {}),
                  ...(reason === "shared"
                    ? { visibility: "shared" as const }
                    : {}),
                },
              ],
      }),
    );
    send.mockClear();
    act(() =>
      result.current.applyMessage({
        type: "error",
        code: reason === "forbidden" ? "forbidden" : "content-conflict",
        operationId: request.operationId,
        message: "保存できません",
      }),
    );
    expect(send).not.toHaveBeenCalled();
    act(() =>
      result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: "unknown",
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(
      send.mock.calls.some(
        ([message]) => message.type === "note:update-content",
      ),
    ).toBe(false);
    if (reason !== "rollback")
      expect(result.current.recoveries).toHaveLength(1);
  });

  it.each([
    "phase",
    "snapshot",
  ] as const)("別段階の編集工程への%sでは古い本文を再送しない", async (delivery) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "以前の課題の本文"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() =>
      result.current.applyMessage(
        delivery === "phase"
          ? {
              type: "phase:updated",
              phase: buildPhaseStep(1, 2),
              phaseRevision: 8,
            }
          : { ...snapshot(), phase: buildPhaseStep(1, 2), phaseRevision: 8 },
      ),
    );
    act(() =>
      result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: "unknown",
      }),
    );
    await act(async () => {});
    act(() => vi.advanceTimersByTime(10000));
    expect(
      send.mock.calls.filter(
        ([message]) => message.type === "note:update-content",
      ),
    ).toHaveLength(1);
  });

  it("非編集工程で受理済みAのACKを受けても未送信Bの書込を予約しない", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "A"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() => result.current.change(noteId, "B"));
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: buildPhaseStep(3),
        phaseRevision: 4,
      }),
    );
    act(() =>
      result.current.applyMessage({
        type: "note:content-saved",
        operationId: request.operationId,
        noteId,
        contentRevision: 1,
      }),
    );
    act(() => vi.advanceTimersByTime(30000));
    expect(result.current.recoveries).toEqual([
      expect.objectContaining({ text: "B", reason: "現在は編集できません。" }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("個人→共有で受理済み照会なら本文を二重保存しない", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "受理済み本文"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    expect(send).toHaveBeenLastCalledWith({
      type: "note:content-status",
      operationId: request.operationId,
    });
    act(() =>
      result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: "accepted",
        noteId,
        contentRevision: 1,
      }),
    );
    act(() => vi.advanceTimersByTime(10000));
    expect(
      send.mock.calls.filter(
        ([message]) => message.type === "note:update-content",
      ),
    ).toHaveLength(1);
    expect(result.current.draftValue(noteId)).toBeUndefined();
    expect(result.current.recoveries).toEqual([]);
  });

  it("個人→共有の日本語変換を勝手に確定せず、本人の確定後に最新の版で保存する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.compositionStart(noteId));
    act(() => result.current.change(noteId, "にほん"));
    act(() =>
      result.current.applyMessage({
        ...snapshot(),
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    act(() => vi.advanceTimersByTime(10000));
    expect(send).not.toHaveBeenCalled();
    expect(result.current.draftValue(noteId)).toBe("にほん");
    act(() => result.current.compositionEnd(noteId, "日本"));
    act(() => vi.advanceTimersByTime(1000));
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "note:update-content",
        content: "日本",
        expectedPhaseRevision: 3,
      }),
    );
  });

  it.each([
    "accepted",
    "unknown",
    "late-ack",
  ] as const)("liveIMEのsnapshot→phase更新では送信済みAの%s後も本人確定Bを保存できる", async (outcome) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "保存中A"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() => result.current.compositionStart(noteId));
    act(() => result.current.change(noteId, "へんかんちゅうB"));
    send.mockClear();
    act(() =>
      result.current.applyMessage({
        ...snapshot(),
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    expect(result.current.draftValue(noteId)).toBe("へんかんちゅうB");
    expect(result.current.recoveries).toEqual([]);
    act(() =>
      result.current.applyMessage(
        outcome === "late-ack"
          ? {
              type: "note:content-saved",
              operationId: request.operationId,
              noteId,
              contentRevision: 1,
            }
          : {
              type: "note:content-status-result",
              operationId: request.operationId,
              status: outcome,
              ...(outcome === "accepted" ? { noteId, contentRevision: 1 } : {}),
            },
      ),
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      send.mock.calls.some(
        ([message]) => message.type === "note:update-content",
      ),
    ).toBe(false);
    act(() => result.current.compositionEnd(noteId, "変換確定B"));
    act(() => vi.advanceTimersByTime(1000));
    const saves = send.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "note:update-content");
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      content: "変換確定B",
      expectedPhaseRevision: 3,
      expectedContentRevision: outcome === "unknown" ? 0 : 1,
    });
  });

  it.each([
    ["send-failed", "accepted"],
    ["send-failed", "unknown"],
    ["result-unknown", "accepted"],
    ["result-unknown", "unknown"],
  ] as const)("同mountのliveIMEは一時的な%sから%s照会を経ても本人確定後だけ保存する", async (failure, outcome) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "送信済みA"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() => result.current.compositionStart(noteId));
    act(() => result.current.change(noteId, "一時切断中の未確定B"));
    send.mockClear();
    if (failure === "send-failed") {
      send.mockImplementationOnce(() => false);
      act(() =>
        result.current.applyMessage({
          ...snapshot(),
          phase: buildPhaseStep(2),
          phaseRevision: 3,
        }),
      );
      act(() => result.current.setConnected(false));
    } else act(() => result.current.recoverDisconnected());
    act(() =>
      result.current.applyMessage({
        ...snapshot(),
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    act(() =>
      result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: outcome,
        ...(outcome === "accepted" ? { noteId, contentRevision: 1 } : {}),
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      send.mock.calls.some(
        ([message]) => message.type === "note:update-content",
      ),
    ).toBe(false);
    expect(result.current.draftValue(noteId)).toBe("一時切断中の未確定B");
    act(() => result.current.compositionEnd(noteId, "本人が確定したB"));
    act(() => result.current.blur(noteId, "本人が確定したB"));
    const saves = send.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "note:update-content");
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({
      content: "本人が確定したB",
      expectedPhaseRevision: 3,
      expectedContentRevision: outcome === "accepted" ? 1 : 0,
    });
  });

  it.each([
    "conflict",
    "deleted",
    "shared",
  ] as const)("個人→共有で%sの保存は照会後も再送しない", async (change) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "端末の本文"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    act(() =>
      result.current.applyMessage(
        change === "deleted"
          ? { type: "note:deleted", noteId }
          : {
              type: "note:updated",
              note: {
                ...note,
                ...(change === "conflict"
                  ? { content: "別タブの本文", contentRevision: 1 }
                  : { visibility: "shared" as const }),
              },
            },
      ),
    );
    act(() =>
      result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: "unknown",
      }),
    );
    await act(async () => {});
    act(() => vi.advanceTimersByTime(10000));
    expect(
      send.mock.calls.filter(
        ([message]) => message.type === "note:update-content",
      ),
    ).toHaveLength(1);
    expect(result.current.recoveries[0]?.text).toBe("端末の本文");
  });

  it("5秒切断して共有へ進んでも同段階の未送信本文はsnapshot後に保存する", async () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "切断中の本文"));
    act(() => result.current.setConnected(false));
    act(() => vi.advanceTimersByTime(5000));
    expect(send).not.toHaveBeenCalled();
    act(() =>
      result.current.applyMessage({
        ...snapshot(),
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    await act(async () => {});
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "note:update-content",
        content: "切断中の本文",
        expectedPhaseRevision: 3,
      }),
    );
  });

  it("共有前保存はAのACKで後続Bを共有せず、最新BのACK後に一度だけ実行する", async () => {
    const { result } = setup();
    const sharedSnapshot = { ...snapshot(), phase: buildPhaseStep(2) };
    act(() => result.current.applyMessage(sharedSnapshot));
    act(() => result.current.change(noteId, "A"));
    act(() => vi.advanceTimersByTime(1000));
    const first = send.mock.calls[0]?.[0];
    if (first?.type !== "note:update-content") throw new Error("save missing");
    const publish = vi.fn();
    act(() => result.current.saveBeforeShare(noteId, publish));
    act(() => result.current.saveBeforeShare(noteId, publish));
    act(() => result.current.change(noteId, "B"));
    act(() =>
      result.current.applyMessage({
        type: "note:content-saved",
        operationId: first.operationId,
        noteId,
        contentRevision: 1,
      }),
    );
    expect(publish).not.toHaveBeenCalled();
    await act(async () => {});
    const last = send.mock.calls.at(-1)?.[0];
    if (last?.type !== "note:update-content") throw new Error("B save missing");
    expect(last.content).toBe("B");
    act(() =>
      result.current.applyMessage({
        type: "note:content-saved",
        operationId: last.operationId,
        noteId,
        contentRevision: 2,
      }),
    );
    expect(publish).toHaveBeenCalledTimes(1);
    expect(result.current.sharingSavePending).toBe(false);
  });

  it.each([
    [false, "non-editable"],
    [true, "non-editable"],
    [false, "rollback"],
    [true, "rollback"],
    [false, "missing"],
    [true, "missing"],
    [false, "other-author"],
    [true, "other-author"],
    [false, "stage"],
    [true, "stage"],
  ] as const)("activeIMEでもsnapshotが%s送信済み/%sなら遅い確定イベントで本文を再開しない", async (inFlight, stop) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    if (inFlight) {
      act(() => result.current.change(noteId, "保存中A"));
      act(() => vi.advanceTimersByTime(1000));
    }
    act(() => result.current.compositionStart(noteId));
    act(() => result.current.change(noteId, "入力中の旧B"));
    act(() =>
      result.current.applyMessage({
        ...snapshot(),
        phase:
          stop === "rollback"
            ? buildPhaseStep(1)
            : stop === "stage"
              ? buildPhaseStep(2, 2)
              : stop === "non-editable"
                ? buildPhaseStep(3)
                : buildPhaseStep(2),
        phaseRevision: 4,
        ...(stop === "rollback" ? { rollbackRevision: 4 } : {}),
        notes:
          stop === "missing"
            ? []
            : [
                {
                  ...note,
                  ...(stop === "other-author"
                    ? { authorId: "22222222-2222-4222-8222-222222222222" }
                    : {}),
                },
              ],
      }),
    );
    send.mockClear();
    act(() => result.current.compositionEnd(noteId, "遅い確定イベントの旧B"));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      send.mock.calls.some(
        ([message]) => message.type === "note:update-content",
      ),
    ).toBe(false);
    if (stop === "rollback")
      expect(result.current.draftValue(noteId)).toBeUndefined();
  });

  it.each([
    "phase",
    "error",
    "deleted",
    "composing",
    "disconnect",
    "conflict",
  ] as const)("共有前の保存待ち中に%sなら遅いACKでも共有しない", (stop) => {
    const { result } = setup();
    act(() =>
      result.current.applyMessage({ ...snapshot(), phase: buildPhaseStep(2) }),
    );
    act(() => result.current.change(noteId, "共有する前の本文"));
    const publish = vi.fn();
    act(() => result.current.saveBeforeShare(noteId, publish));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    expect(result.current.sharingSavePending).toBe(true);
    act(() => {
      if (stop === "phase")
        result.current.applyMessage({
          type: "phase:updated",
          phase: buildPhaseStep(3),
          phaseRevision: 3,
        });
      if (stop === "error")
        result.current.applyMessage({
          type: "error",
          code: "content-conflict",
          operationId: request.operationId,
          message: "他の編集",
        });
      if (stop === "deleted")
        result.current.applyMessage({ type: "note:deleted", noteId });
      if (stop === "composing") result.current.compositionStart(noteId);
      if (stop === "disconnect") result.current.setConnected(false);
      if (stop === "conflict")
        result.current.applyMessage({
          type: "note:updated",
          note: {
            ...note,
            content: "別タブで更新した本文",
            contentRevision: 2,
          },
        });
    });
    act(() =>
      result.current.applyMessage({
        type: "note:content-saved",
        operationId: request.operationId,
        noteId,
        contentRevision: 1,
      }),
    );
    expect(publish).not.toHaveBeenCalled();
    expect(result.current.sharingSavePending).toBe(false);
  });

  it.each([
    false,
    true,
  ])("再読込後も元の個人工程を覚え、同段階共有だけで保存を継続する（送信済み:%s）", async (sent) => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "再読込した本文"));
    if (sent) act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    first.unmount();
    send.mockClear();
    const second = setup();
    act(() =>
      second.result.current.applyMessage({
        ...snapshot(),
        phase: buildPhaseStep(2),
        phaseRevision: 3,
      }),
    );
    if (request?.type === "note:update-content") {
      expect(send).toHaveBeenCalledExactlyOnceWith({
        type: "note:content-status",
        operationId: request.operationId,
      });
      act(() =>
        second.result.current.applyMessage({
          type: "note:content-status-result",
          operationId: request.operationId,
          status: "unknown",
        }),
      );
    }
    await act(async () => {});
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "note:update-content",
        content: "再読込した本文",
        expectedPhaseRevision: 3,
      }),
    );
    expect(second.result.current.recoveries).toEqual([]);
    second.unmount();
  });

  it.each([
    false,
    true,
  ])("非編集工程で未受理保存を止め、同じ共有工程のsnapshotでも復活しない（送信済み:%s）", async (sent) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "打ち切る本文"));
    if (sent) act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    act(() =>
      result.current.applyMessage({
        type: "phase:updated",
        phase: buildPhaseStep(3),
        phaseRevision: 4,
      }),
    );
    if (request?.type === "note:update-content")
      act(() =>
        result.current.applyMessage({
          type: "note:content-status-result",
          operationId: request.operationId,
          status: "unknown",
        }),
      );
    act(() =>
      result.current.applyMessage({
        ...snapshot(),
        phase: buildPhaseStep(2),
        phaseRevision: 5,
      }),
    );
    if (request?.type === "note:update-content")
      act(() =>
        result.current.applyMessage({
          type: "note:content-status-result",
          operationId: request.operationId,
          status: "unknown",
        }),
      );
    await act(async () => {});
    act(() => vi.advanceTimersByTime(10000));
    expect(
      send.mock.calls.filter(
        ([message]) => message.type === "note:update-content",
      ),
    ).toHaveLength(sent ? 1 : 0);
  });

  it.each([
    false,
    true,
  ])("復元snapshotで未送信/送信中の本文を自動再送せず、古い成功通知も無視する（送信済み:%s）", async (inFlight) => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "戻る操作で取り消す本文"));
    if (inFlight) act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    send.mockClear();
    act(() =>
      result.current.applyMessage({
        ...snapshot(),
        phaseRevision: 4,
        rollbackRevision: 4,
      }),
    );
    if (request?.type === "note:update-content") {
      act(() =>
        result.current.applyMessage({
          type: "note:content-saved",
          operationId: request.operationId,
          noteId,
          contentRevision: 1,
        }),
      );
      act(() =>
        result.current.applyMessage({
          type: "note:content-status-result",
          operationId: request.operationId,
          status: "accepted",
          noteId,
          contentRevision: 1,
        }),
      );
    }
    await act(async () => {});
    act(() => vi.advanceTimersByTime(30000));
    expect(send).not.toHaveBeenCalled();
    expect(result.current.draftValue(noteId)).toBeUndefined();
    expect(result.current.recoveries).toEqual([]);
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.change(noteId, "復元後に書いた文章"));
    act(() => vi.advanceTimersByTime(1000));
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "note:update-content",
        content: "復元後に書いた文章",
        expectedPhaseRevision: 4,
      }),
    );
  });

  it.each([
    false,
    true,
  ])("切断・再読込した古い本文を復元後に照会せず、新しく編集した本文は通常保存する（送信済み:%s）", async (inFlight) => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "古い送信"));
    if (inFlight) act(() => vi.advanceTimersByTime(1000));
    act(() => first.result.current.recoverDisconnected());
    first.unmount();
    send.mockClear();
    const second = setup();
    act(() =>
      second.result.current.applyMessage({
        ...snapshot(),
        phaseRevision: 4,
        rollbackRevision: 4,
      }),
    );
    await act(async () => {});
    expect(send).not.toHaveBeenCalled();
    expect(second.result.current.draftValue(noteId)).toBeUndefined();
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toBeNull();
    second.unmount();
    const third = setup();
    act(() =>
      third.result.current.applyMessage({
        ...snapshot(),
        phaseRevision: 4,
        rollbackRevision: 4,
      }),
    );
    act(() => third.result.current.change(noteId, "戻した後の新しい本文"));
    act(() => vi.advanceTimersByTime(1000));
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "note:update-content",
        content: "戻した後の新しい本文",
        expectedPhaseRevision: 4,
      }),
    );
  });

  it.each([
    [1, "accepted"],
    [1, "unknown"],
    [1, "late-ack"],
    [2, "accepted"],
    [2, "unknown"],
    [2, "late-ack"],
  ] as const)("通常再読込で送信中AとIME未確定Bを分け、step%sの%s後もBを回収できる", async (step, outcome) => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "確定済みA"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() => first.result.current.compositionStart(noteId));
    act(() => first.result.current.change(noteId, "変換中のB"));
    // 通常の再読込。認証失効・切断回収の特別な経路は呼ばない。
    first.unmount();
    send.mockClear();
    const second = setup();
    act(() =>
      second.result.current.applyMessage({
        ...snapshot(outcome === "accepted" ? 1 : 0),
        phase: buildPhaseStep(step),
        phaseRevision: step === 1 ? 2 : 3,
        notes: [
          {
            ...note,
            ...(outcome === "accepted"
              ? { content: request.content, contentRevision: 1 }
              : {}),
          },
        ],
      }),
    );
    expect(second.result.current.recoveries).toEqual([
      expect.objectContaining({
        noteId,
        text: "変換中のB",
        reason: "変換中に中断されました。",
      }),
    ]);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: "note:content-status",
      operationId: request.operationId,
    });
    act(() =>
      second.result.current.applyMessage(
        outcome === "late-ack"
          ? {
              type: "note:content-saved",
              operationId: request.operationId,
              noteId,
              contentRevision: 1,
            }
          : {
              type: "note:content-status-result",
              operationId: request.operationId,
              status: outcome,
              ...(outcome === "accepted" ? { noteId, contentRevision: 1 } : {}),
            },
      ),
    );
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(
      send.mock.calls.some(
        ([message]) => message.type === "note:update-content",
      ),
    ).toBe(false);
    expect(second.result.current.recoveries).toEqual([
      expect.objectContaining({ noteId, text: "変換中のB" }),
    ]);
    const stored = sessionStorage.getItem(
      `idea-boost:note-drafts:v1:${userId}:room`,
    );
    expect(stored).toContain("変換中のB");
    expect(stored).toContain("interrupted-composition");
  });

  it("再接続を打ち切っても未送信の本文を回収でき、再送timerを残さない", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "端末に残す本文"));
    act(() => result.current.recoverDisconnected());
    expect(result.current.recoveries).toEqual([
      expect.objectContaining({ noteId, text: "端末に残す本文" }),
    ]);
    act(() => vi.advanceTimersByTime(30000));
    expect(send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toContain("端末に残す本文");
  });

  it.each([
    "accepted",
    "unknown",
    "conflict",
  ] as const)("期限切れでACK不明の保存を同じ本人の再認証後に照会し%sを安全に扱う", async (outcome) => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "結果不明の本文"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() => first.result.current.recoverDisconnected());
    expect(first.result.current.recoveries[0]?.text).toBe("結果不明の本文");
    expect(first.result.current.recoveries[0]?.reason).toContain("結果");
    act(() => vi.advanceTimersByTime(30000));
    expect(send).toHaveBeenCalledTimes(1);
    first.unmount();
    send.mockClear();
    const second = setup();
    expect(send).not.toHaveBeenCalled();
    act(() =>
      second.result.current.applyMessage(
        snapshot(outcome === "unknown" ? 0 : 1),
      ),
    );
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: "note:content-status",
      operationId: request.operationId,
    });
    act(() =>
      second.result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: outcome === "accepted" ? "accepted" : "unknown",
        ...(outcome === "accepted" ? { noteId, contentRevision: 1 } : {}),
      }),
    );
    await act(async () => {});
    if (outcome === "unknown") {
      expect(send).toHaveBeenLastCalledWith(request);
    } else {
      expect(send).toHaveBeenCalledTimes(1);
      if (outcome === "accepted") {
        expect(second.result.current.recoveries).toEqual([]);
        expect(
          sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
        ).toBeNull();
      } else {
        expect(second.result.current.recoveries).toEqual([
          expect.objectContaining({
            text: "結果不明の本文",
            reason: "他の編集と競合しました。",
          }),
        ]);
      }
    }
    second.unmount();
  });

  it.each([
    "accepted",
    "unknown",
  ] as const)("再認証後の照会待ちと%sの処理中は結果不明の文章を回収欄に残す", (outcome) => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "照会中もコピーする文章"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() => first.result.current.recoverDisconnected());
    first.unmount();
    send.mockClear();
    const second = setup();
    act(() =>
      second.result.current.applyMessage({
        ...snapshot(),
        notes: outcome === "accepted" ? [] : [note],
      }),
    );
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: "note:content-status",
      operationId: request.operationId,
    });
    expect(second.result.current.recoveries).toEqual([
      expect.objectContaining({ text: "照会中もコピーする文章" }),
    ]);
    act(() => vi.advanceTimersByTime(3000));
    expect(second.result.current.recoveries).toHaveLength(1);
    act(() =>
      second.result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: outcome,
        ...(outcome === "accepted" ? { noteId, contentRevision: 1 } : {}),
      }),
    );
    if (outcome === "unknown") {
      expect(send).toHaveBeenLastCalledWith(request);
      expect(second.result.current.recoveries).toHaveLength(1);
      act(() =>
        second.result.current.applyMessage({
          type: "note:content-saved",
          operationId: request.operationId,
          noteId,
          contentRevision: 1,
        }),
      );
    }
    expect(second.result.current.recoveries).toEqual([]);
    second.unmount();
  });

  it("再認証後にAの保存結果が確定したら、回収した後続入力Bを次の版で保存する", async () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "A"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() => result.current.change(noteId, "B"));
    act(() => result.current.recoverDisconnected());
    send.mockClear();
    act(() => result.current.applyMessage(snapshot(1)));
    expect(result.current.recoveries[0]?.text).toBe("B");
    act(() =>
      result.current.applyMessage({
        type: "note:content-status-result",
        status: "accepted",
        operationId: request.operationId,
        noteId,
        contentRevision: 1,
      }),
    );
    await act(async () => {});
    expect(result.current.recoveries).toEqual([]);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "note:update-content",
        content: "B",
        expectedContentRevision: 1,
      }),
    );
  });

  it("変換中に失効し工程の版が変わった保存結果が不明でも文章を回収欄に残す", async () => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "送信した文章"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0];
    if (request?.type !== "note:update-content")
      throw new Error("save missing");
    act(() => first.result.current.compositionStart(noteId));
    act(() => first.result.current.change(noteId, "変換中に残した文章"));
    act(() => first.result.current.recoverDisconnected());
    first.unmount();
    send.mockClear();
    const second = setup();
    act(() =>
      second.result.current.applyMessage({ ...snapshot(), phaseRevision: 3 }),
    );
    act(() =>
      second.result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: "unknown",
      }),
    );
    await act(async () => {});
    second.rerender();
    expect(second.result.current.recoveries).toEqual([
      expect.objectContaining({
        text: "変換中に残した文章",
        reason: "変換中に中断されました。",
      }),
    ]);
    act(() => vi.advanceTimersByTime(30000));
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: "note:content-status",
      operationId: request.operationId,
    });
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toContain("変換中に残した文章");
    second.unmount();
  });

  it("停止999msでは送らず1000msで1回だけ送り、ACKで下書きを整理する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "新しい本文"));
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toContain("新しい本文");
    act(() => vi.advanceTimersByTime(999));
    expect(send).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(send).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0]?.[0] as Extract<
      ClientMessage,
      { type: "note:update-content" }
    >;
    act(() =>
      result.current.applyMessage({
        type: "note:content-saved",
        noteId,
        operationId: request.operationId,
        contentRevision: 1,
      }),
    );
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toBeNull();
  });

  it("IME変換中の文字列を送らず確定後の最終値を保存する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.compositionStart(noteId));
    act(() => result.current.change(noteId, "かん"));
    act(() => vi.advanceTimersByTime(1500));
    expect(send).not.toHaveBeenCalled();
    act(() => result.current.compositionEnd(noteId, "漢字"));
    act(() => vi.advanceTimersByTime(1000));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: "漢字" }),
    );
  });

  it("A送信中のB入力をAのACKで消さず、次のrevisionで送る", async () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "A"));
    act(() => vi.advanceTimersByTime(1000));
    const first = send.mock.calls[0]?.[0] as Extract<
      ClientMessage,
      { type: "note:update-content" }
    >;
    act(() => result.current.change(noteId, "B"));
    act(() =>
      result.current.applyMessage({
        type: "note:content-saved",
        noteId,
        operationId: first.operationId,
        contentRevision: 1,
      }),
    );
    expect(result.current.draftValue(noteId)).toBe("B");
    await act(async () => {});
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "B", expectedContentRevision: 1 }),
    );
  });

  it("再読込後はsnapshot前に送らず、同じrevisionなら安全に再送する", async () => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "復元する文"));
    first.unmount();
    send.mockClear();
    const second = setup();
    expect(send).not.toHaveBeenCalled();
    act(() => second.result.current.applyMessage(snapshot()));
    await act(async () => {});
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ content: "復元する文" }),
    );
  });

  it("ACK消失後に進行済みでもreceipt照会で確定済み本文を識別する", () => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "確定した文"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0] as Extract<
      ClientMessage,
      { type: "note:update-content" }
    >;
    first.unmount();
    send.mockClear();
    const second = setup();
    act(() =>
      second.result.current.applyMessage({
        ...snapshot(1),
        phase: buildPhaseStep(3),
        notes: [{ ...note, content: "確定した文", contentRevision: 1 }],
      }),
    );
    expect(send).toHaveBeenCalledWith({
      type: "note:content-status",
      operationId: request.operationId,
    });
    act(() =>
      second.result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: "accepted",
        noteId,
        contentRevision: 1,
      }),
    );
    expect(second.result.current.recoveries).toHaveLength(0);
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toBeNull();
  });

  it("接続中にACKが失われてもreceiptを照会し、確定済み下書きを整理する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "ACKが届かない文"));
    act(() => vi.advanceTimersByTime(1000));
    const request = send.mock.calls[0]?.[0] as Extract<
      ClientMessage,
      { type: "note:update-content" }
    >;
    act(() => vi.advanceTimersByTime(3000));
    expect(send).toHaveBeenCalledWith({
      type: "note:content-status",
      operationId: request.operationId,
    });
    act(() =>
      result.current.applyMessage({
        type: "note:content-status-result",
        operationId: request.operationId,
        status: "accepted",
        noteId,
        contentRevision: 1,
      }),
    );
    expect(result.current.recoveries).toHaveLength(0);
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toBeNull();
  });

  it("ルームを離れた後は旧接続から保存状態を照会しない", () => {
    const hook = setup();
    act(() => hook.result.current.applyMessage(snapshot()));
    act(() => hook.result.current.change(noteId, "離脱前の文章"));
    act(() => vi.advanceTimersByTime(1000));
    hook.unmount();
    send.mockClear();
    act(() => vi.advanceTimersByTime(3000));
    expect(send).not.toHaveBeenCalled();
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toContain("離脱前の文章");
  });

  it("送信が拒否された文章を通知し、接続復帰時に版を再確認して送る", async () => {
    send.mockImplementationOnce(() => false);
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "送信できなかった文"));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.recoveries).toEqual([
      expect.objectContaining({ noteId, text: "送信できなかった文" }),
    ]);
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toContain("送信できなかった文");
    act(() => result.current.setConnected(false));
    send.mockClear();
    act(() => result.current.applyMessage(snapshot()));
    await act(async () => {});
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "note:update-content",
        content: "送信できなかった文",
      }),
    );
  });

  it("保存状態の照会を送れない場合も確定扱いにせず通知する", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "照会待ちの文"));
    act(() => vi.advanceTimersByTime(1000));
    send.mockImplementationOnce(() => false);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.recoveries).toEqual([
      expect.objectContaining({ noteId, text: "照会待ちの文" }),
    ]);
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toContain("照会待ちの文");
  });

  it("再接続直後のreceipt照会が送れなくても文章を回収できる", () => {
    const { result } = setup();
    act(() => result.current.applyMessage(snapshot()));
    act(() => result.current.change(noteId, "受領が不明な文"));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.setConnected(false));
    send.mockImplementationOnce(() => false);
    act(() => result.current.applyMessage(snapshot()));
    expect(result.current.recoveries).toEqual([
      expect.objectContaining({ noteId, text: "受領が不明な文" }),
    ]);
  });

  it("保存領域が使えなくても認証中断前に未反映本文を回収できる", () => {
    const storageWrite = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      });
    try {
      const { result } = setup();
      act(() => result.current.applyMessage(snapshot()));
      act(() =>
        result.current.change(noteId, "Googleへ進む前にコピーする本文"),
      );
      act(() => result.current.recoverDisconnected());
      expect(result.current.recoveries).toEqual([
        expect.objectContaining({
          noteId,
          text: "Googleへ進む前にコピーする本文",
        }),
      ]);
      act(() => vi.advanceTimersByTime(30000));
      expect(send).not.toHaveBeenCalled();
    } finally {
      storageWrite.mockRestore();
    }
  });

  it("別アカウントで再表示しても前の本人の未反映本文を表示・再送しない", () => {
    const first = setup();
    act(() => first.result.current.applyMessage(snapshot()));
    act(() => first.result.current.change(noteId, "前の本人だけの本文"));
    act(() => first.result.current.recoverDisconnected());
    first.unmount();
    send.mockClear();
    const otherUserId = "22222222-2222-4222-8222-222222222222";
    const other = renderHook(() =>
      useNoteAutosave({ roomId: "room", userId: otherUserId, send }),
    );
    act(() => other.result.current.applyMessage(snapshot()));
    expect(other.result.current.recoveries).toEqual([]);
    expect(other.result.current.draftValue(noteId)).toBeUndefined();
    act(() => vi.advanceTimersByTime(30000));
    expect(send).not.toHaveBeenCalled();
    expect(
      sessionStorage.getItem(`idea-boost:note-drafts:v1:${userId}:room`),
    ).toContain("前の本人だけの本文");
  });

  it("保存済みの回収文があっても再読込時にhydration差分を作らない", async () => {
    sessionStorage.setItem(
      `idea-boost:note-drafts:v1:${userId}:room`,
      JSON.stringify({
        version: 1,
        drafts: [
          {
            noteId,
            baseContent: "原文",
            baseRevision: 0,
            text: "未反映",
            committedText: "未反映",
            generation: 1,
            composing: false,
            inFlight: null,
            recoveryReason: "conflict",
          },
        ],
      }),
    );
    const Probe = () => {
      const draft = useNoteAutosave({ roomId: "room", userId, send });
      return <p>回収: {draft.recoveries.length}</p>;
    };
    const browserWindow = window;
    vi.stubGlobal("window", undefined);
    const serverHtml = renderToString(<Probe />);
    vi.stubGlobal("window", browserWindow);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    const errors: string[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Probe />, {
        onRecoverableError: (error) =>
          errors.push(error instanceof Error ? error.message : String(error)),
      });
    });
    expect(errors).toEqual([]);
    expect(container.textContent).toBe("回収: 1");
    await act(async () => root?.unmount());
    vi.unstubAllGlobals();
  });
});
