import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { completedBoardFixture } from "@/contracts/completed-rooms.fixture";
import { CompletedBoardView } from "./completed-board-view";

describe("参加者向け成果の付箋一覧", () => {
  it.each([
    1, 2, 3,
  ])("フェーズ%sの成果は本文と状態を示し、内部座標を表示しない", (phase) => {
    const board = completedBoardFixture({ phase });
    board.notes[0].x = 1145.80481372;
    board.notes[0].y = -16.08523418;
    board.notes[1].excluded = true;
    board.decisions = [
      { phase, noteId: board.notes[0].id, content: board.notes[0].content },
    ];
    render(<CompletedBoardView board={board} />);
    const list = within(screen.getByRole("list"));
    expect(list.getByText(board.notes[0].content)).toBeVisible();
    expect(list.getByText("採用済み")).toBeVisible();
    expect(list.getByText("候補外")).toBeVisible();
    expect(list.getAllByText("グループ：つながりのきっかけ")).toHaveLength(2);
    expect(
      list.queryByText(/配置 \(|実現のしやすさ .*\/ 価値/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
    if (phase === 3)
      expect(screen.getByText(/上ほど高い.*右ほど高い/)).toBeVisible();
  });
  it("通常ボードの保存済み小数座標と重なり順を配置図で再現する", () => {
    const board = completedBoardFixture();
    board.notes[0].x = 1145.80481372;
    board.notes[0].y = -16.08523418;
    render(<CompletedBoardView board={board} />);
    const rectangles = screen.getByRole("img").querySelectorAll("rect");
    expect(rectangles[1]).toHaveAttribute("x", "1145.80481372");
    expect(rectangles[1]).toHaveAttribute("y", "-16.08523418");
  });
});
