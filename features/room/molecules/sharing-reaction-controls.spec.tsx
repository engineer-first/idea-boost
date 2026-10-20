import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { ClientMessage } from "@/contracts/room-protocol";
import { useSharingReactions } from "../logic/use-sharing-reactions";
import { SharingReactionControls } from "./sharing-reaction-controls";

const sharingPhase = buildPhaseStep(2);

function ControlsWithSendLimit({
  send,
}: {
  send: (message: ClientMessage) => boolean;
}) {
  const { canSendLike, sendLike } = useSharingReactions({
    phase: sharingPhase,
    phaseRevision: 3,
    connectionStatus: "open",
    send,
  });
  return (
    <SharingReactionControls disabled={!canSendLike} onSendLike={sendLike} />
  );
}

afterEach(() => vi.useRealTimers());

describe("SharingReactionControls", () => {
  it("いいねのヒントが開いていてもEscape1回でバーを閉じる", async () => {
    render(<SharingReactionControls onSendLike={vi.fn()} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const like = screen.getByRole("button", { name: "いいねを送る" });
    fireEvent.focus(like);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("いいね");
    fireEvent.keyDown(like, { key: "Escape" });
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
  });

  it("いいねを送った後もバーを開いたまま続けて送れ、Escapeで閉じる", () => {
    const onSendLike = vi.fn();
    render(
      <SharingReactionControls onSendLike={onSendLike} disabled={false} />,
    );
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    fireEvent.click(screen.getByRole("button", { name: "いいねを送る" }));
    expect(onSendLike).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "いいねを送る" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "いいねを送る" }));
    expect(onSendLike).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole("button", { name: "いいねを送る" }), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
  });

  it("送信後の待機中もバーとフォーカスを保ち、キーとクリックを拒否してから再送できる", async () => {
    const user = userEvent.setup();
    const onSendLike = vi.fn();
    const { rerender } = render(
      <SharingReactionControls onSendLike={onSendLike} disabled={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const like = screen.getByRole("button", { name: "いいねを送る" });
    act(() => like.focus());
    fireEvent.click(like);
    rerender(<SharingReactionControls onSendLike={onSendLike} disabled />);
    expect(like).toBeVisible();
    expect(like).toBeEnabled();
    expect(like).toHaveFocus();
    expect(like).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter} ");
    fireEvent.click(like);
    expect(onSendLike).toHaveBeenCalledTimes(1);
    rerender(
      <SharingReactionControls onSendLike={onSendLike} disabled={false} />,
    );
    expect(like).toBeEnabled();
    expect(like).toHaveAttribute("aria-disabled", "false");
    await user.keyboard(" ");
    expect(onSendLike).toHaveBeenCalledTimes(2);
  });

  it("400ms以内と3件上限の待機中は送らず、解除後は同じバーから再送できる", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => true);
    render(<ControlsWithSendLimit send={send} />);
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const like = screen.getByRole("button", { name: "いいねを送る" });
    act(() => like.focus());
    fireEvent.click(like);
    expect(send).toHaveBeenCalledTimes(1);
    expect(like).toBeEnabled();
    expect(like).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(like);
    expect(send).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(399));
    fireEvent.click(like);
    expect(send).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(like).toHaveFocus();
    fireEvent.click(like);
    expect(send).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(400));
    fireEvent.click(like);
    expect(send).toHaveBeenCalledTimes(3);

    act(() => vi.advanceTimersByTime(400));
    fireEvent.click(like);
    expect(send).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(1_799));
    fireEvent.click(like);
    expect(send).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(1));
    expect(like).toHaveFocus();
    fireEvent.click(like);
    expect(send).toHaveBeenCalledTimes(4);
    expect(send).toHaveBeenLastCalledWith({
      type: "reaction:send",
      kind: "like",
      phaseRevision: 3,
    });
    fireEvent.keyDown(like, { key: "Escape" });
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
  });

  it("送信できないときはバーを開いて送信できない", () => {
    const onSendLike = vi.fn();
    render(<SharingReactionControls onSendLike={onSendLike} disabled />);
    expect(screen.getByRole("button", { name: "リアクション" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    expect(onSendLike).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
  });
});
