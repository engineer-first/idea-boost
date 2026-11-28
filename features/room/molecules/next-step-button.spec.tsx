import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextStepButton } from "./next-step-button";

function setup(overrides: Partial<Parameters<typeof NextStepButton>[0]> = {}) {
  const props = {
    disabled: false,
    onPress: vi.fn(),
    ...overrides,
  };
  render(<NextStepButton {...props} />);
  return props;
}

describe("NextStepButton", () => {
  it("押すと確認を挟まずに onPress を1回呼ぶ", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "次のステップへ" }));
    expect(props.onPress).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("disabled のときは押せず、onPress を呼ばない", () => {
    const props = setup({ disabled: true });
    const button = screen.getByRole("button", { name: "次のステップへ" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(props.onPress).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "decision" }, "採用すると次へ"],
    [{ kind: "votes" }, "全票使うと次へ"],
    [{ kind: "votesOthers" }, "投票がそろうと次へ"],
    [{ kind: "connection" }, "再接続中…"],
  ] as const)(
    "押せない理由が %o の間は、ボタンに「%s」と出す",
    (waiting, label) => {
      setup({ disabled: true, waiting });
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    },
  );

  it("押せる間は、待つ理由が渡されていても「次のステップへ」と出す", () => {
    setup({ waiting: { kind: "votes" } });
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toBeEnabled();
  });

  it("次のステップの名前を、ボタンの横に出す", () => {
    setup({ nextStepLabel: "1-2 共有" });
    expect(screen.getByTestId("next-step-hint")).toHaveTextContent(
      "次は 1-2 共有",
    );
  });

  it("目を向けてほしいときだけ、押せるボタンに強調の印を付ける", () => {
    setup({ emphasized: true });
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).toHaveAttribute("data-emphasized", "true");
  });

  it("押せない間は強調しない", () => {
    setup({ emphasized: true, disabled: true });
    expect(
      screen.getByRole("button", { name: "次のステップへ" }),
    ).not.toHaveAttribute("data-emphasized");
  });
});
