import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DotVotePalette } from "./dot-vote-palette";

describe("DotVotePalette", () => {
  it("票種と残数を、付箋へドラッグするシールとして表示する", () => {
    render(
      <DotVotePalette
        voteRemaining={{ subjective: 1, objective: 2 }}
        pendingOperationCount={0}
        feedback={null}
        disabled={false}
        selectedKind={null}
        onStickerSelect={vi.fn()}
        onStickerDragStart={vi.fn()}
      />,
    );

    const palette = screen.getByRole("region", { name: "投票パレット" });
    const subjective = screen.getByRole("button", {
      name: "主観シール 残り1票",
    });
    const objective = screen.getByRole("button", {
      name: "客観シール 残り2票",
    });

    expect(
      within(palette).getByText(
        "シールを付箋へドラッグ、または選択して連続で貼り付け",
      ),
    ).toHaveClass("sr-only");
    expect(within(subjective).getByText("主観")).toBeVisible();
    expect(within(subjective).getByText("直感・共感")).toBeVisible();
    expect(within(subjective).getByText("残り1票")).toBeVisible();
    expect(within(objective).getByText("客観")).toBeVisible();
    expect(within(objective).getByText("根拠・比較")).toBeVisible();
    expect(within(objective).getByText("残り2票")).toBeVisible();
    expect(palette).toHaveClass("h-12", "rounded-xl", "bg-white");
    const subjectiveImage = within(subjective).getByTestId(
      "dot-vote-sticker-image-subjective",
    );
    const objectiveImage = within(objective).getByTestId(
      "dot-vote-sticker-image-objective",
    );
    expect(subjectiveImage).toHaveClass("size-7", "rounded-full", "border-2");
    expect(objectiveImage).toHaveClass("size-7", "rounded-lg", "border-2");
    expect(
      within(subjectiveImage).getByTestId("dot-vote-sticker-icon-subjective"),
    ).toBeInTheDocument();
    expect(
      within(objectiveImage).getByTestId("dot-vote-sticker-icon-objective"),
    ).toBeInTheDocument();
  });

  it("残数が0の票種は選べない", () => {
    render(
      <DotVotePalette
        voteRemaining={{ subjective: 0, objective: 2 }}
        pendingOperationCount={0}
        feedback={null}
        disabled={false}
        selectedKind={null}
        onStickerSelect={vi.fn()}
        onStickerDragStart={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "主観シール 残り0票" }),
    ).toBeDisabled();
  });

  it("送信中と失敗時の状態を読み上げる", () => {
    render(
      <DotVotePalette
        voteRemaining={{ subjective: 1, objective: 2 }}
        pendingOperationCount={0}
        feedback={{ state: "failed", message: "投票上限を超えています。" }}
        disabled={false}
        selectedKind={null}
        onStickerSelect={vi.fn()}
        onStickerDragStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "投票上限を超えています。",
    );
  });

  it("主観・客観シールはクリック選択とドラッグ開始の両方を通知する", () => {
    const onStickerDragStart = vi.fn();
    const onStickerSelect = vi.fn();

    render(
      <DotVotePalette
        voteRemaining={{ subjective: 1, objective: 2 }}
        pendingOperationCount={0}
        feedback={null}
        disabled={false}
        selectedKind={null}
        onStickerSelect={onStickerSelect}
        onStickerDragStart={onStickerDragStart}
      />,
    );

    const sticker = screen.getByRole("button", {
      name: "客観シール 残り2票",
    });
    fireEvent.pointerDown(sticker, {
      pointerId: 1,
      clientX: 300,
      clientY: 24,
    });

    expect(onStickerDragStart).toHaveBeenCalledWith(
      "objective",
      expect.objectContaining({ pointerId: 1 }),
    );

    fireEvent.click(sticker, { clientX: 300, clientY: 24 });

    expect(onStickerSelect).toHaveBeenCalledWith(
      "objective",
      expect.objectContaining({ clientX: 300, clientY: 24 }),
    );
  });

  it("選択中のシールを押下状態と案内文で示す", () => {
    render(
      <DotVotePalette
        voteRemaining={{ subjective: 1, objective: 2 }}
        pendingOperationCount={0}
        feedback={null}
        disabled={false}
        selectedKind="subjective"
        onStickerSelect={vi.fn()}
        onStickerDragStart={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "主観シール 残り1票" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "主観シールを選択中です。付箋をクリックして連続で貼れます。",
    );
  });
});
