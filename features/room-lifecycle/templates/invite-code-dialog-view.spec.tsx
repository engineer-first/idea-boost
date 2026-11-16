import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InviteCodeDialogView } from "./invite-code-dialog-view";

function setup(
  overrides: Partial<Parameters<typeof InviteCodeDialogView>[0]> = {},
) {
  const props = {
    inviteCode: "ABC234",
    hostName: "田中太郎",
    open: true,
    pending: false,
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  render(<InviteCodeDialogView {...props} />);
  return props;
}

describe("InviteCodeDialogView", () => {
  it("招待コードをダイアログの説明として関連付ける", () => {
    setup();

    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "ABC234",
    );
  });

  it("招待コードとホスト名付きタイトルを表示する", () => {
    setup();

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("ABC234")).toBeInTheDocument();
    expect(
      screen.getByText("田中太郎 さんが作成したルームに参加しますか？"),
    ).toBeInTheDocument();
  });

  it("open=false のときは何も表示しない", () => {
    setup({ open: false });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("「参加する」で onConfirm を呼ぶ", () => {
    const { onConfirm } = setup();

    fireEvent.click(screen.getByTestId("invite-join-action"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("pending 中はボタンが無効になり文言が「参加中…」になる", () => {
    setup({ pending: true });

    const join = screen.getByTestId("invite-join-action");
    expect(join).toBeDisabled();
    expect(join).toHaveTextContent("参加中…");
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
  });
});
