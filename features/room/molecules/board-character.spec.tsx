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
  it("吹き出しは一文字ずつ順に出るよう文字を分け、読み上げ用の枠には全文を1回だけ置く", () => {
    render(<BoardCharacter message="次は投票だよ🎉" />);
    const bubble = screen.getByTestId("board-character-bubble");
    // 表示中も全文が DOM にあり、吹き出しの幅は最初から全文で決まる。
    expect(bubble).toHaveTextContent("次は投票だよ🎉");
    const chars = bubble.querySelectorAll<HTMLElement>("[data-char]");
    expect(Array.from(chars, (c) => c.textContent)).toEqual([
      ..."次は投票だよ🎉",
    ]);
    expect(
      Array.from(chars, (c) => c.style.getPropertyValue("--char-index")),
    ).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    // 全文を出し切るまでの時間は文字数によらず1秒前後に収める。
    const step = Number.parseFloat(
      bubble.style.getPropertyValue("--char-step"),
    );
    expect(step * chars.length).toBeGreaterThan(500);
    expect(step * chars.length).toBeLessThanOrEqual(1100);
    expect(bubble).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(/^次は投票だよ🎉$/);
  });
});
