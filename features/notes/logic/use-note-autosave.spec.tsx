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
