import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ClientMessage } from "@/contracts/room-protocol";
import {
  RoomSharingReactionControls,
  RoomSharingReactionDisplay,
  RoomSharingReactions,
  type RoomSharingReactionsProps,
  type SharingReactionMessageHandler,
} from "./room-sharing-reactions";
import {
  buildRoomSharingReactionEvent,
  buildRoomSharingReactionsFixture,
} from "./room-sharing-reactions.fixture";

function setup(overrides: Partial<RoomSharingReactionsProps> = {}) {
  const messageRef = createRef<SharingReactionMessageHandler>();
  const send = vi.fn<(message: ClientMessage) => boolean>(() => true);
  const props = {
    ...buildRoomSharingReactionsFixture(),
    messageRef,
    send,
    children: (
      <>
        <RoomSharingReactionControls />
        <RoomSharingReactionDisplay />
      </>
    ),
    ...overrides,
  };
  return {
    ...render(<RoomSharingReactions {...props} />),
    props,
    messageRef,
    send,
  };
}

afterEach(() => vi.useRealTimers());

describe("RoomSharingReactions", () => {
  it("選んだ種類を送信し、受信した反応をbridge経由で表示して3秒後に消す", () => {
    vi.useFakeTimers();
    const { messageRef, send } = setup();
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const question = screen.getByRole("button", {
      name: "どうして？のリアクションを送る",
    });
    fireEvent.click(question);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: "reaction:send",
      kind: "question",
      phaseRevision: 3,
    });
    expect(question).toHaveAttribute("aria-disabled", "true");
    act(() => {
      messageRef.current?.applyMessage(buildRoomSharingReactionEvent());
    });
    expect(screen.getByRole("img", { name: "どうして？" })).toBeVisible();
    act(() => vi.advanceTimersByTime(400));
    expect(question).toHaveAttribute("aria-disabled", "false");
    act(() => vi.advanceTimersByTime(2600));
    expect(
      screen.queryByRole("img", { name: "どうして？" }),
    ).not.toBeInTheDocument();
    expect(question).toBeVisible();
  });

  it.each([
    {
      label: "外部の操作制限",
      disabled: true,
      connectionStatus: "open" as const,
      blocked: false,
    },
    {
      label: "切断",
      disabled: false,
      connectionStatus: "closed" as const,
      blocked: false,
    },
    {
      label: "ルームの操作制限",
      disabled: false,
      connectionStatus: "open" as const,
      blocked: true,
    },
  ])(
    "$label があると送信ボタンを無効にする",
    ({ disabled, connectionStatus, blocked }) => {
      const { send } = setup({
        connectionStatus,
        blocked,
        children: <RoomSharingReactionControls disabled={disabled} />,
      });
      const trigger = screen.getByRole("button", { name: "リアクション" });
      expect(trigger).toBeDisabled();
      fireEvent.click(trigger);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(["phase", "connection"] as const)(
    "%s が変わると受信済みの反応を消す",
    (change) => {
      const { props, messageRef, rerender } = setup();
      act(() => {
        messageRef.current?.applyMessage(buildRoomSharingReactionEvent());
      });
      expect(screen.getByRole("img", { name: "どうして？" })).toBeVisible();
      rerender(
        <RoomSharingReactions
          {...props}
          {...(change === "phase"
            ? { phase: buildPhaseStep(2, 2), phaseRevision: 4 }
            : { connectionStatus: "closed" as const })}
        />,
      );
      expect(
        screen.queryByRole("img", { name: "どうして？" }),
      ).not.toBeInTheDocument();
      act(() => {
        messageRef.current?.applyMessage(
          buildRoomSharingReactionEvent("question", 2),
        );
      });
      expect(
        screen.queryByRole("img", { name: "どうして？" }),
      ).not.toBeInTheDocument();
    },
  );

  it("受信・送信待機・消去の更新で無関係なchildrenの描画処理を繰り返さない", () => {
    vi.useFakeTimers();
    const drawBoard = vi.fn();
    function Board() {
      drawBoard();
      return <div>共有キャンバス</div>;
    }
    const { messageRef } = setup({
      children: (
        <>
          <Board />
          <RoomSharingReactionControls />
          <RoomSharingReactionDisplay />
        </>
      ),
    });
    expect(drawBoard).toHaveBeenCalledTimes(1);
    act(() => {
      messageRef.current?.applyMessage(buildRoomSharingReactionEvent());
    });
    expect(screen.getByRole("img", { name: "どうして？" })).toBeVisible();
    expect(drawBoard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const question = screen.getByRole("button", {
      name: "どうして？のリアクションを送る",
    });
    fireEvent.click(question);
    expect(question).toHaveAttribute("aria-disabled", "true");
    expect(drawBoard).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(400));
    expect(question).toHaveAttribute("aria-disabled", "false");
    expect(drawBoard).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2600));
    expect(
      screen.queryByRole("img", { name: "どうして？" }),
    ).not.toBeInTheDocument();
    expect(drawBoard).toHaveBeenCalledTimes(1);
  });
});
