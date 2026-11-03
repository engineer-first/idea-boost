// LeaveConfirmDialog の単体テスト。
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LeaveConfirmDialog } from "./leave-confirm-dialog";

describe("LeaveConfirmDialog（leave）", () => {
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
    expect(
      screen.getByText(/退出すると、このルームに戻るには/),
    ).toBeInTheDocument();
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

it("成果の選択を求めず退出を一度確認する", async () => {
  const onConfirm = vi.fn();
  render(
    <LeaveConfirmDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
      isLeaving={false}
    />,
  );
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "退出する" }));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith();
});

it.each([true, false])(
  "最後の在籍者にだけ終了と招待URLの無効化を知らせる lastMember=%s",
  (lastMember) => {
    render(
      <LeaveConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isLeaving={false}
        lastMember={lastMember}
      />,
    );
    const warning = screen.queryByText(
      /退出するとルームが終了し、招待URLは使えなくなります/,
    );
    if (lastMember) expect(warning).toBeInTheDocument();
    else expect(warning).not.toBeInTheDocument();
  },
);
