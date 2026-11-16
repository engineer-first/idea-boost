import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextPhaseConfirmDialog } from "./next-phase-confirm-dialog";

function setup(
  overrides: Partial<Parameters<typeof NextPhaseConfirmDialog>[0]> = {},
) {
  const props = {
    disabled: false,
    onConfirm: vi.fn(),
    ...overrides,
  };
  render(<NextPhaseConfirmDialog {...props} />);
  return props;
}

describe("NextPhaseConfirmDialog", () => {
  it("トリガーボタンを表示する", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeInTheDocument();
  });

  it("disabled のときトリガーボタンが無効になる", () => {
    setup({ disabled: true });

    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeDisabled();
  });

  it("メンバーを待って押せない間は、あと何人で進めるかをボタンに出す", () => {
    setup({
      disabled: true,
      waiting: { kind: "members", remaining: 2, total: 5 },
    });

    expect(
      screen.getByRole("button", { name: "あと2人で次へ" }),
    ).toBeDisabled();
  });

  it("通信を待って押せない間は、通信が戻ると進めるとボタンに出す", () => {
    setup({ disabled: true, waiting: { kind: "connection" } });

    expect(screen.getByRole("button", { name: "再接続中…" })).toBeDisabled();
  });

  it("押せるときは待ちの情報があっても「次のステップへ」を出す", () => {
    setup({ waiting: { kind: "members", remaining: 1, total: 3 } });

    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeEnabled();
  });

  it("確認ダイアログは補足説明を出さず、未完了メンバーと操作だけを示す", () => {
    setup({ notReadyNames: ["Owner"] });

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("完了していないメンバーがいます");
    expect(screen.getByRole("img", { name: "Owner" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("付箋");
    expect(dialog).not.toHaveTextContent("タイマー");
    expect(dialog).not.toHaveTextContent("下書き");
  });

  it("「次へ進む」で onConfirm を呼ぶ（確認前には呼ばない）", () => {
    const { onConfirm } = setup();

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "次へ進む" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("「キャンセル」では onConfirm を呼ばない", () => {
    const { onConfirm } = setup();

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

it("確認中に全員完了してキャンセルしても進行ボタンへフォーカスを戻す", async () => {
  const props = {
    disabled: false,
    onConfirm: vi.fn(),
  };
  const { rerender } = render(
    <NextPhaseConfirmDialog {...props} requireConfirmation />,
  );
  fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
  rerender(<NextPhaseConfirmDialog {...props} requireConfirmation={false} />);
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toHaveFocus(),
  );
  expect(props.onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
  expect(props.onConfirm).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});
