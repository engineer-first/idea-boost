import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteFontSizeControls } from "./note-font-size-controls";

describe("NoteFontSizeControls", () => {
  it("12〜24pxを1px刻みで、キーボード・タッチ対応のボタンから変更する", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NoteFontSizeControls
        fontSize={14}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "付箋の文字を小さく" }));
    fireEvent.keyDown(
      screen.getByRole("button", { name: "付箋の文字を大きく" }),
      { key: "Enter" },
    );
    fireEvent.click(screen.getByRole("button", { name: "付箋の文字を大きく" }));
    expect(onChange).toHaveBeenNthCalledWith(1, 13);
    expect(onChange).toHaveBeenNthCalledWith(2, 15);

    rerender(
      <NoteFontSizeControls
        fontSize={12}
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: "付箋の文字を小さく" }),
    ).toBeDisabled();
    rerender(
      <NoteFontSizeControls
        fontSize={24}
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: "付箋の文字を大きく" }),
    ).toBeDisabled();
  });

  it("付箋未選択時は対象を案内して操作を無効にする", () => {
    render(
      <NoteFontSizeControls fontSize={null} disabled onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole("group", { name: "選択した付箋の文字サイズ" }),
    ).toHaveTextContent("--px");
    expect(
      screen
        .getAllByRole("button")
        .every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("ボタンにホバー・フォーカスすると何が変わるかを簡潔に示す", () => {
    render(
      <NoteFontSizeControls
        fontSize={14}
        disabled={false}
        onChange={vi.fn()}
      />,
    );

    act(() =>
      screen.getByRole("button", { name: "付箋の文字を大きく" }).focus(),
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("文字を大きく");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent(
      "共有後は全員に反映",
    );
  });

  it("押せないボタンもホバーで簡潔な説明を出す", () => {
    vi.useFakeTimers();
    try {
      render(
        <NoteFontSizeControls
          fontSize={24}
          disabled={false}
          onChange={vi.fn()}
        />,
      );
      const increase = screen.getByRole("button", {
        name: "付箋の文字を大きく",
      });
      expect(increase).toBeDisabled();
      const trigger = increase.parentElement;
      if (!trigger) throw new Error("押せないボタンを包むtriggerが必要");
      fireEvent.pointerMove(trigger, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByRole("tooltip")).toHaveTextContent("文字を大きく");
    } finally {
      vi.useRealTimers();
    }
  });

  it("混在サイズの一括操作では --px 表示のまま増減を通知できる", () => {
    const onStep = vi.fn();
    render(
      <NoteFontSizeControls
        fontSize={null}
        hasSelection
        canDecrease
        canIncrease
        disabled={false}
        onChange={vi.fn()}
        onStep={onStep}
      />,
    );

    expect(
      screen.getByRole("group", { name: "選択した付箋の文字サイズ" }),
    ).toHaveTextContent("--px");
    fireEvent.click(screen.getByRole("button", { name: "付箋の文字を小さく" }));
    fireEvent.click(screen.getByRole("button", { name: "付箋の文字を大きく" }));
    expect(onStep).toHaveBeenNthCalledWith(1, -1);
    expect(onStep).toHaveBeenNthCalledWith(2, 1);
  });
});
