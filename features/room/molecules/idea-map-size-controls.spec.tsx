import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IdeaMapSizeControls } from "./idea-map-size-controls";

describe("IdeaMapSizeControls", () => {
  it("ホストは現在の段階から隣の段階へ変更できる", () => {
    const onResize = vi.fn();
    render(
      <IdeaMapSizeControls
        sizeLevel={2}
        initialized
        isHost
        isDisconnected={false}
        isDragging={false}
        onResize={onResize}
      />,
    );

    expect(screen.getByText("マップの広さ")).toBeInTheDocument();
    expect(screen.queryByText("広さ 3 / 9")).not.toBeInTheDocument();
    expect(
      screen.queryByText("付箋数に合わせて調整できます。"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "マップを狭くする" }));
    fireEvent.click(screen.getByRole("button", { name: "マップを広くする" }));
    expect(onResize.mock.calls).toEqual([[1], [3]]);
  });

  it.each([
    ["非ホスト", { isHost: false }, "広さを変更できるのはホストだけです。"],
    ["ドラッグ中", { isDragging: true }, "付箋のドラッグ中は変更できません。"],
    ["切断中", { isDisconnected: true }, "接続が回復すると変更できます。"],
    ["未初期化", { initialized: false }, "初期サイズを準備しています。"],
  ])("%sは理由を読み上げて変更を無効化する", (_label, overrides, reason) => {
    render(
      <IdeaMapSizeControls
        sizeLevel={1}
        initialized
        isHost
        isDisconnected={false}
        isDragging={false}
        onResize={vi.fn()}
        {...overrides}
      />,
    );

    expect(screen.getByText(reason)).toHaveClass("sr-only");
    expect(
      screen.getByRole("button", { name: "マップを狭くする" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "マップを広くする" }),
    ).toBeDisabled();
  });

  it("最小・最大の段階ではそれぞれ一方向だけを無効化する", () => {
    const { rerender } = render(
      <IdeaMapSizeControls
        sizeLevel={0}
        initialized
        isHost
        isDisconnected={false}
        isDragging={false}
        onResize={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "マップを狭くする" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "マップを広くする" }),
    ).toBeEnabled();

    rerender(
      <IdeaMapSizeControls
        sizeLevel={8}
        initialized
        isHost
        isDisconnected={false}
        isDragging={false}
        onResize={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "マップを狭くする" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "マップを広くする" }),
    ).toBeDisabled();
  });
});
