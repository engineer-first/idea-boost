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
  const { canSendReaction, sendReaction } = useSharingReactions({
    phase: sharingPhase,
    phaseRevision: 3,
    connectionStatus: "open",
    send,
  });
  return (
    <SharingReactionControls
      disabled={!canSendReaction}
      onSendReaction={sendReaction}
    />
  );
}

afterEach(() => vi.useRealTimers());

describe("SharingReactionControls", () => {
  it("5種類を固定順で選べ、選んだ種類を送信してバーを維持する", () => {
    const onSendReaction = vi.fn();
    render(
      <SharingReactionControls
        onSendReaction={onSendReaction}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const choices = [
      ["いいねを送る", "like"],
      ["拍手を送る", "clap"],
      ["おお！を送る", "surprised"],
      ["なるほどを送る", "insight"],
      ["どうして？のリアクションを送る", "question"],
    ] as const;
    const buttons = screen
      .getAllByRole("button")
      .filter((button) =>
        choices.some(([name]) => button.getAttribute("aria-label") === name),
      );
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(
      choices.map(([name]) => name),
    );
    for (const [name, kind] of choices) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(onSendReaction).toHaveBeenLastCalledWith(kind);
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
  });

  it("どうして？のヒントが理由や背景への関心を示し、Escapeで閉じられる", async () => {
    render(
      <SharingReactionControls onSendReaction={vi.fn()} disabled={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const question = screen.getByRole("button", {
      name: "どうして？のリアクションを送る",
    });
    fireEvent.focus(question);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /^どうして？$/u,
    );
    fireEvent.keyDown(question, { key: "Escape" });
    expect(question).not.toBeInTheDocument();
  });

  it("いいねのヒントが開いていてもEscape1回でバーを閉じる", async () => {
    render(
      <SharingReactionControls onSendReaction={vi.fn()} disabled={false} />,
    );
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
    const onSendReaction = vi.fn();
    render(
      <SharingReactionControls
        onSendReaction={onSendReaction}
        disabled={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    fireEvent.click(screen.getByRole("button", { name: "いいねを送る" }));
    expect(onSendReaction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "いいねを送る" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "いいねを送る" }));
    expect(onSendReaction).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole("button", { name: "いいねを送る" }), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
  });

  it("送信後の待機中もバーとフォーカスを保ち、キーとクリックを拒否してから再送できる", async () => {
    const user = userEvent.setup();
    const onSendReaction = vi.fn();
    const { rerender } = render(
      <SharingReactionControls
        onSendReaction={onSendReaction}
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const like = screen.getByRole("button", { name: "いいねを送る" });
    act(() => like.focus());
    fireEvent.click(like);
    rerender(
      <SharingReactionControls onSendReaction={onSendReaction} disabled />,
    );
    expect(like).toBeVisible();
    expect(like).toBeEnabled();
    expect(like).toHaveFocus();
    expect(like).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter} ");
    fireEvent.click(like);
    expect(onSendReaction).toHaveBeenCalledTimes(1);
    rerender(
      <SharingReactionControls
        onSendReaction={onSendReaction}
        disabled={false}
      />,
    );
    expect(like).toBeEnabled();
    expect(like).toHaveAttribute("aria-disabled", "false");
    await user.keyboard(" ");
    expect(onSendReaction).toHaveBeenCalledTimes(2);
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
    const onSendReaction = vi.fn();
    render(
      <SharingReactionControls onSendReaction={onSendReaction} disabled />,
    );
    expect(screen.getByRole("button", { name: "リアクション" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    expect(onSendReaction).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
  });
});
