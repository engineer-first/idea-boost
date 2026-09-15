import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DotVoteSticker } from "./dot-vote-sticker";

describe("DotVoteSticker", () => {
  it("自分の客観シールは票数を示し、1票取り消せる", () => {
    const onRemove = vi.fn();
    render(
      <DotVoteSticker
        kind="objective"
        count={2}
        state="confirmed"
        onRemove={onRemove}
      />,
    );

    const sticker = screen.getByRole("button", {
      name: "客観シール 2票を1票取り消す",
    });
    const image = within(sticker).getByTestId(
      "dot-vote-sticker-image-objective",
    );

    expect(image).toHaveClass("size-7", "rounded-lg", "border-2");
    expect(
      within(image).getByTestId("dot-vote-sticker-icon-objective"),
    ).toBeInTheDocument();

    fireEvent.click(sticker);

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("プレビューは操作対象にせず、票を貼る位置として示す", () => {
    render(<DotVoteSticker kind="subjective" count={1} state="preview" />);

    expect(screen.getByLabelText("主観シールを貼る位置")).toHaveAttribute(
      "data-state",
      "preview",
    );
  });

  it.each([0, 1, 12])("投票結果では集計した%d票を×票数で表示する", (count) => {
    render(<DotVoteSticker kind="subjective" count={count} state="result" />);

    expect(screen.getByText(`×${count}`)).toBeVisible();
  });

  it("投票中の個別シールには×1を表示しない", () => {
    render(<DotVoteSticker kind="subjective" count={1} state="confirmed" />);

    expect(screen.queryByText("×1")).not.toBeInTheDocument();
  });

  it("投票中のシールはポインター操作の開始を親へ通知する", () => {
    const onDragStart = vi.fn();
    render(
      <DotVoteSticker
        kind="objective"
        count={1}
        state="confirmed"
        onRemove={vi.fn()}
        onDragStart={onDragStart}
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "客観シール 1票を1票取り消す" }),
      { pointerId: 7, clientX: 20, clientY: 30 },
    );

    expect(onDragStart).toHaveBeenCalledWith(
      expect.objectContaining({ pointerId: 7 }),
    );
  });
});
