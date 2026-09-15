import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { NextPhaseConfirmDialog } from "./next-phase-confirm-dialog";

function setup(
  overrides: Partial<Parameters<typeof NextPhaseConfirmDialog>[0]> = {},
) {
  const props = {
    phase: buildPhaseStep(1),
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

  it("押下で確認ダイアログを開き、現在ステップのラベルを含む説明を出す", () => {
    setup({ phase: buildPhaseStep(2) });

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

    expect(screen.getByText("次のステップへ進みますか？")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("1-2 課題共有");
  });

  it("「移行する」で onConfirm を呼ぶ（確認前には呼ばない）", () => {
    const { onConfirm } = setup();

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "移行する" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("「キャンセル」では onConfirm を呼ばない", () => {
    const { onConfirm } = setup();

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
