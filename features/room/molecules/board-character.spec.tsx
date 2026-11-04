import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardCharacter } from "./board-character";

describe("ボードのキャラクター", () => {
  it("吹き出しが消えてもキャラクターを押して再表示を要求できる", () => {
    const onReplay = vi.fn();
    const { rerender } = render(
      <BoardCharacter message="残り30秒" onReplay={onReplay} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("残り30秒");
    rerender(<BoardCharacter message={null} onReplay={onReplay} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "直前の一言をもう一度見る" }),
    );
    expect(onReplay).toHaveBeenCalledOnce();
  });
});
