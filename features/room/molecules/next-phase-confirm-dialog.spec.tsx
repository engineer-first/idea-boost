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

  it("未完了メンバーがいる場合は確認内容を短く表示する", () => {
    setup({ notReadyNames: ["Owner"] });

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

    const dialog = screen.getByRole("alertdialog");
    expect(
      screen.getByText("完了していないメンバーがいます"),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "全員の完了を待たずに、次のステップへ進みますか？",
    );
    expect(dialog).toHaveTextContent("Owner");
    expect(screen.getByRole("img", { name: "Owner" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("本文のある共有付箋");
  });

  it("確認ダイアログで現在ステップと、空白の共有付箋だけを削除する範囲を説明する", () => {
    setup({ phase: buildPhaseStep(2) });

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

    expect(screen.getByText("次のステップへ進みますか？")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("1-2 課題共有");
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "このフェーズの空白だけの共有付箋は削除します。",
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "本文のある共有付箋と下書きは残ります。",
    );
  });

  it.each([
    1, 2, 3,
  ] as const)("フェーズ%sの個人作業から進むときは空白のマイ付箋も削除すると説明する", (phase) => {
    setup({ phase: buildPhaseStep(1, phase) });

    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "個人で書き出すステップの空白だけのマイ付箋も削除します。",
    );
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

it.each([
  3, 5,
])("step%sの進行確認は緊急復元を不可能と説明せず、下書きの扱いを伝える", (step) => {
  setup({ phase: buildPhaseStep(step, 1) });
  fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
  expect(screen.getByRole("alertdialog")).not.toHaveTextContent("戻れません");
  expect(screen.getByRole("alertdialog")).toHaveTextContent(/下書き.*破棄/);
});
