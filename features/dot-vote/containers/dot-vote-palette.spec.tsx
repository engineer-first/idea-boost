import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DotVotePalette, type DotVotePaletteProps } from "./dot-vote-palette";

describe("DotVotePalette", () => {
  it("票種と残数を、指定された投票基準とともに表示する", () => {
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

    expect(within(palette).getByText("シールを選ぶ")).toBeVisible();
    expect(within(palette).getByText("付箋へ貼る")).toBeVisible();
    expect(within(subjective).getByText("主観")).toBeVisible();
    expect(
      within(subjective).getByText("主観は「激しく共感する、取り組みたい」。"),
    ).toBeVisible();
    expect(within(subjective).getByText("残り1票")).toBeVisible();
    expect(within(objective).getByText("客観")).toBeVisible();
    expect(
      within(objective).getByText("客観は「自分以外の人にも価値がありそう」。"),
    ).toBeVisible();
    expect(within(objective).getByText("残り2票")).toBeVisible();
    expect(
      within(palette).getByText("投票対象は現在のフェーズの個々の付箋です。"),
    ).toHaveClass("sr-only");

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

  it.each([
    "subjective",
    "objective",
  ] as const)("%sを使い切ってもアイコンを残し、説明と選択表示を外して追加操作を防ぐ", (kind) => {
    const onStickerSelect = vi.fn();
    const onStickerDragStart = vi.fn();
    const remaining = { subjective: 1, objective: 3, [kind]: 0 };
    const otherKind = kind === "subjective" ? "objective" : "subjective";
    render(
      <DotVotePalette
        voteRemaining={remaining}
        pendingOperationCount={0}
        feedback={null}
        disabled={false}
        selectedKind={kind}
        onStickerSelect={onStickerSelect}
        onStickerDragStart={onStickerDragStart}
      />,
    );

    const exhausted = screen.getByRole("button", { name: /残り0票/ });
    expect(exhausted).toBeDisabled();
    expect.soft(exhausted).toHaveAttribute("aria-pressed", "false");
    expect(exhausted).toHaveAccessibleDescription("使い切りました");
    expect
      .soft(within(exhausted).queryByTestId(`dot-vote-sticker-icon-${kind}`))
      .toBeVisible();
    expect.soft(within(exhausted).queryByText(/は「/)).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`dot-vote-sticker-icon-${otherKind}`),
    ).toBeVisible();
    expect(screen.getAllByText(/は「/).length).toBe(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("選択中");
    fireEvent.click(exhausted);
    fireEvent.pointerDown(exhausted, { pointerId: 1 });
    expect(onStickerSelect).not.toHaveBeenCalled();
    expect(onStickerDragStart).not.toHaveBeenCalled();
  });

  it("シールを戻す操作中は取り消しの意味を常時見えるヒントで示す", () => {
    render(
      <DotVotePalette
        voteRemaining={{ subjective: 1, objective: 2 }}
        pendingOperationCount={0}
        feedback={null}
        disabled={false}
        selectedKind={null}
        isReturnDropTarget
        onStickerSelect={vi.fn()}
        onStickerDragStart={vi.fn()}
      />,
    );

    const hint = screen
      .getByRole("region", { name: "投票パレット" })
      .querySelector("p:not(.sr-only)");
    expect(hint).not.toBeNull();
    expect(hint).toBeVisible();
    expect(hint).not.toHaveClass("sr-only");
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

  it("選択中・ドラッグ中・残票ゼロの状態をライト配色で示す", () => {
    const { rerender } = render(
      <DotVotePalette
        voteRemaining={{ subjective: 0, objective: 2 }}
        pendingOperationCount={0}
        feedback={null}
        disabled={false}
        selectedKind="subjective"
        onStickerSelect={vi.fn()}
        onStickerDragStart={vi.fn()}
      />,
    );

    const subjective = screen.getByRole("button", {
      name: "主観シール 残り0票",
    });
    const objective = screen.getByRole("button", {
      name: "客観シール 残り2票",
    });

    expect(subjective).toHaveClass(
      "disabled:opacity-100",
      "bg-rose-50/80",
      "text-rose-950",
      "disabled:bg-slate-100",
      "disabled:text-slate-500",
      "active:cursor-grabbing",
    );
    expect(subjective).not.toHaveClass("ring-rose-700/75");
    expect(objective).toHaveClass(
      "active:cursor-grabbing",
      "bg-blue-50/80",
      "text-blue-950",
    );

    rerender(
      <DotVotePalette
        voteRemaining={{ subjective: 1, objective: 2 }}
        pendingOperationCount={0}
        feedback={null}
        disabled={false}
        selectedKind="objective"
        onStickerSelect={vi.fn()}
        onStickerDragStart={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "客観シール 残り2票" }),
    ).toHaveClass("ring-blue-700/75", "ring-offset-white");
  });

  it("送信中の0票を使い切りと断定せず、受理後に表示を切り替える", () => {
    const props: DotVotePaletteProps = {
      voteRemaining: { subjective: 0, objective: 0 },
      pendingOperationCount: 4,
      feedback: null,
      disabled: false,
      selectedKind: null,
      onStickerSelect: vi.fn(),
      onStickerDragStart: vi.fn(),
    };
    const { rerender } = render(<DotVotePalette {...props} />);
    expect(screen.queryByText("使い切りました")).not.toBeInTheDocument();
    expect(screen.getAllByText("確認待ち")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("送信中");
    expect(screen.getByRole("status")).not.toHaveClass("sr-only");
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
      fireEvent.pointerDown(button, { pointerId: 1 });
    }
    expect(props.onStickerSelect).not.toHaveBeenCalled();
    expect(props.onStickerDragStart).not.toHaveBeenCalled();

    rerender(
      <DotVotePalette
        {...props}
        pendingOperationCount={0}
        feedback={{ state: "confirmed", message: "投票を反映しました。" }}
      />,
    );
    expect(screen.getAllByText("使い切りました")).toHaveLength(2);
    expect(screen.queryByText("確認待ち")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "投票を反映しました。",
    );
    expect(
      screen.queryByText("貼った自分のシールは移動・取り消しできます。"),
    ).not.toBeInTheDocument();
  });

  it.each([
    { state: "failed" as const, message: "投票を送信できませんでした。" },
    { state: "confirmed" as const, message: "投票を1票取り消しました。" },
  ])("$state 後は返された残票を再び選べる", (feedback) => {
    const props: DotVotePaletteProps = {
      voteRemaining: { subjective: 0, objective: 0 },
      pendingOperationCount: 0,
      feedback: null,
      disabled: false,
      selectedKind: null,
      onStickerSelect: vi.fn(),
      onStickerDragStart: vi.fn(),
    };
    const { rerender } = render(<DotVotePalette {...props} />);
    expect(screen.getAllByText("使い切りました")).toHaveLength(2);
    rerender(
      <DotVotePalette
        {...props}
        voteRemaining={{ subjective: 0, objective: 1 }}
        feedback={feedback}
      />,
    );
    expect(screen.getAllByText("使い切りました")).toHaveLength(1);
    const objective = screen.getByRole("button", {
      name: "客観シール 残り1票",
    });
    expect(objective).toBeEnabled();
    expect(within(objective).getByText(/自分以外の人にも価値/)).toBeVisible();
    fireEvent.click(objective);
    expect(props.onStickerSelect).toHaveBeenCalledWith(
      "objective",
      expect.anything(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(feedback.message);
    expect(screen.getByRole("status")).not.toHaveClass("sr-only");
  });

  it("通信切断中は古い成功表示や使い切りより接続待ちを示す", () => {
    render(
      <DotVotePalette
        voteRemaining={{ subjective: 0, objective: 3 }}
        pendingOperationCount={1}
        feedback={{ state: "confirmed", message: "投票を反映しました。" }}
        disabled
        selectedKind={null}
        onStickerSelect={vi.fn()}
        onStickerDragStart={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("再接続");
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "投票を反映しました。",
    );
    expect(screen.queryByText("使い切りました")).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button"))
      expect(button).toBeDisabled();
  });
});
