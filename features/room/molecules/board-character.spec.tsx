import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BoardCharacter } from "./board-character";

describe("ボードのキャラクター", () => {
  it("一言がない間は先生も吹き出しも描画せず、読み上げ用の枠だけを残す", () => {
    render(<BoardCharacter message={null} />);
    expect(screen.queryByTestId("board-character")).not.toBeInTheDocument();
    // 読み上げソフトは既存の枠の中身の変化を読むため、枠は常に置いておく。
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
  it("一言と装飾の先生を表示し、一言が消えると両方を取り除く", () => {
    const { rerender } = render(<BoardCharacter message={null} />);
    const status = screen.getByRole("status");
    rerender(<BoardCharacter message="残り30秒" />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("残り30秒");
    expect(screen.getByTestId("board-character-bubble")).toHaveTextContent(
      "残り30秒",
    );
    expect(
      screen.getByTestId("board-character").querySelector("img"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<BoardCharacter message={null} />);
    expect(screen.queryByTestId("board-character")).not.toBeInTheDocument();
    expect(status).toBeEmptyDOMElement();
  });
});
