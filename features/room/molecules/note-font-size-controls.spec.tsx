import { fireEvent, render, screen } from "@testing-library/react";
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
});
