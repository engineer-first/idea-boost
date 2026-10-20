import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SharingReactionControls } from "./sharing-reaction-controls";

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

  it("送信後の待機中もバーを保ち、送信可能になったら同じバーから再送できる", () => {
    const onSendLike = vi.fn();
    const { rerender } = render(
      <SharingReactionControls onSendLike={onSendLike} disabled={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    fireEvent.click(screen.getByRole("button", { name: "いいねを送る" }));
    rerender(<SharingReactionControls onSendLike={onSendLike} disabled />);
    const like = screen.getByRole("button", { name: "いいねを送る" });
    expect(like).toBeVisible();
    expect(like).toBeDisabled();
    fireEvent.click(like);
    expect(onSendLike).toHaveBeenCalledTimes(1);
    rerender(
      <SharingReactionControls onSendLike={onSendLike} disabled={false} />,
    );
    expect(like).toBeEnabled();
    fireEvent.click(like);
    expect(onSendLike).toHaveBeenCalledTimes(2);
  });

  it("送信できないときはバーを開いて送信できない", () => {
    const onSendLike = vi.fn();
    render(<SharingReactionControls onSendLike={onSendLike} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    expect(onSendLike).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "いいねを送る" }),
    ).not.toBeInTheDocument();
  });
});
