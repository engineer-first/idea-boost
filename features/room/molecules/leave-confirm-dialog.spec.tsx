// LeaveConfirmDialog の単体テスト。
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LeaveConfirmDialog } from "./leave-confirm-dialog";

describe("LeaveConfirmDialog（leave）", () => {
  it("完了後の参加者は退出をやめて成果へ戻れる", async () => {
    const onReturnToOutcome = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <LeaveConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isLeaving={false}
        mode="leave"
        completed
        onReturnToOutcome={onReturnToOutcome}
      />,
    );
    expect(screen.getByText("退出しますか？")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "退出をやめて成果へ戻る" }),
    );
    expect(onReturnToOutcome).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("open=true のとき「退出しますか？」が表示される", () => {
    render(
      <LeaveConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isLeaving={false}
      />,
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("退出しますか？")).toBeInTheDocument();
    expect(screen.getByText(/あなたのみが退出/)).toBeInTheDocument();
  });

  it("「退出する」ボタンで onConfirm が呼ばれる", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <LeaveConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isLeaving={false}
      />,
    );
    await user.click(screen.getByTestId("leave-confirm-action"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("isLeaving=true のとき全ボタンが disabled になる", () => {
    render(
      <LeaveConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isLeaving
      />,
    );
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
    expect(screen.getByTestId("leave-confirm-action")).toBeDisabled();
    expect(screen.getByTestId("leave-confirm-action")).toHaveTextContent(
      "退出中…",
    );
  });
});

describe("LeaveConfirmDialog（disband）", () => {
  it("確認中に完了したら、ホストの解散確認も本人退出だけに切り替わる", async () => {
    const onConfirm = vi.fn();
    const onReturnToOutcome = vi.fn();
    const user = userEvent.setup();
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      onConfirm,
      onReturnToOutcome,
      isLeaving: false,
      mode: "disband" as const,
    };
    const { rerender } = render(<LeaveConfirmDialog {...props} />);
    expect(screen.getByRole("button", { name: "ルームを解散" })).toBeEnabled();

    rerender(<LeaveConfirmDialog {...props} completed />);
    expect(screen.queryAllByRole("button", { name: /解散|削除/ })).toHaveLength(
      0,
    );
    await user.click(screen.getByRole("button", { name: "退出する" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "退出をやめて成果へ戻る" }),
    );
    expect(onReturnToOutcome).toHaveBeenCalledTimes(1);
  });

  it("ホスト向けに解散文言を表示する", () => {
    render(
      <LeaveConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isLeaving={false}
        mode="disband"
      />,
    );
    expect(screen.getByText("ルームを解散しますか？")).toBeInTheDocument();
    expect(screen.getByText(/メンバー全員が退出/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ルームを解散" }),
    ).toBeInTheDocument();
  });

  it("isLeaving=true のとき「解散中…」になる", () => {
    render(
      <LeaveConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isLeaving
        mode="disband"
      />,
    );
    expect(screen.getByTestId("leave-confirm-action")).toHaveTextContent(
      "解散中…",
    );
  });
});
