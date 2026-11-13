import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DotVotePalette, type DotVotePaletteProps } from "./dot-vote-palette";

function visibleText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll(".sr-only")) hidden.remove();
  return clone.textContent ?? "";
}

function paletteRegion(): HTMLElement {
  return screen.getByRole("region", { name: "投票パレット" });
}

describe("DotVotePalette", () => {
  it("票種と残数を表示し、投票基準と操作手順はパレットに出さない", () => {
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
      name: "「イチオシ！」シール 残り1票",
    });
    const objective = screen.getByRole("button", {
      name: "「需要ありそう」シール 残り2票",
    });

    expect(within(subjective).getByText("イチオシ！")).toBeVisible();
    expect(within(subjective).getByText("主観")).toBeVisible();
    expect(within(objective).getByText("需要ありそう")).toBeVisible();
    expect(within(objective).getByText("客観")).toBeVisible();
    expect(visibleText(palette)).not.toMatch(
      /激しく共感する|自分以外の人にも価値がありそう/,
    );
    expect(visibleText(palette)).not.toMatch(/シールを選ぶ|付箋へ貼る/);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(
      within(palette).getByText("投票対象は現在のフェーズの個々の付箋です。"),
    ).toHaveClass("sr-only");

    const subjectiveImage = within(subjective).getByTestId(
      "dot-vote-sticker-image-subjective",
    );
    const objectiveImage = within(objective).getByTestId(
      "dot-vote-sticker-image-objective",
    );
    expect(subjectiveImage).toHaveClass("size-13", "rounded-full", "border-2");
    expect(objectiveImage).toHaveClass("size-13", "rounded-md", "border-2");
    expect(
      within(subjectiveImage).getByTestId("dot-vote-sticker-icon-subjective"),
    ).toBeInTheDocument();
    expect(
      within(objectiveImage).getByTestId("dot-vote-sticker-icon-objective"),
    ).toBeInTheDocument();
  });

  it.each([
    {
      label: "通常",
      props: { voteRemaining: { subjective: 1, objective: 2 } },
      name: "「イチオシ！」シール 残り1票",
      hidden: "選んで貼る",
    },
    {
      label: "選択中",
      props: {
        voteRemaining: { subjective: 1, objective: 2 },
        selectedKind: "subjective" as const,
      },
      name: "「イチオシ！」シール 残り1票",
      hidden: "選択中",
    },
    {
      label: "使い切り",
      props: { voteRemaining: { subjective: 0, objective: 2 } },
      name: "「イチオシ！」シール 残り0票",
      hidden: "使い切りました",
    },
  ])(
    "$label のシールは状態を文言で画面に出さず、読み上げで伝える",
    ({ props, name, hidden }) => {
      render(
        <DotVotePalette
          pendingOperationCount={0}
          feedback={null}
          disabled={false}
          selectedKind={null}
          onStickerSelect={vi.fn()}
          onStickerDragStart={vi.fn()}
          {...props}
        />,
      );
      const button = screen.getByRole("button", { name });
      expect(visibleText(button)).not.toContain(hidden);
      expect(button).toHaveAccessibleDescription(hidden);
    },
  );

  it.each([
    { subjective: 1, objective: 2 },
    { subjective: 0, objective: 0 },
  ])(
    "残票（イチオシ！ $subjective 票、需要ありそう $objective 票）を上限と同数の点で示し、使った票は中抜きにして「残り◯票」の文字は出さない",
    (remaining) => {
      render(
        <DotVotePalette
          voteRemaining={remaining}
          pendingOperationCount={0}
          feedback={null}
          disabled={false}
          selectedKind={null}
          onStickerSelect={vi.fn()}
          onStickerDragStart={vi.fn()}
        />,
      );

      for (const [kind, label, limit] of [
        ["subjective", "イチオシ！", 1],
        ["objective", "需要ありそう", 3],
      ] as const) {
        const button = screen.getByRole("button", {
          name: `「${label}」シール 残り${remaining[kind]}票`,
        });
        const pips = within(button).getAllByTestId(
          `dot-vote-remaining-pip-${kind}`,
        );
        expect(pips.map((pip) => pip.dataset.state)).toEqual(
          Array.from({ length: limit }, (_, index) =>
            index < remaining[kind] ? "remaining" : "used",
          ),
        );
        expect(visibleText(button)).not.toMatch(/残り\d票/);
      }
    },
  );

  it.each([
    { label: "送信中", pendingOperationCount: 2, disabled: false },
    { label: "接続待ち", pendingOperationCount: 0, disabled: true },
  ])(
    "$label は票数の代わりにスピナーを出し、待ちの文言を画面に出さない",
    ({ pendingOperationCount, disabled }) => {
      render(
        <DotVotePalette
          voteRemaining={{ subjective: 0, objective: 0 }}
          pendingOperationCount={pendingOperationCount}
          feedback={null}
          disabled={disabled}
          selectedKind={null}
          onStickerSelect={vi.fn()}
          onStickerDragStart={vi.fn()}
        />,
      );
      for (const button of screen.getAllByRole("button")) {
        expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull();
        expect(
          button.querySelector('[data-testid^="dot-vote-remaining-pip-"]'),
        ).toBeNull();
        expect(visibleText(button)).not.toMatch(/残り\d票|確認待ち|接続待ち/);
      }
    },
  );

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
      screen.getByRole("button", { name: "「イチオシ！」シール 残り0票" }),
    ).toBeDisabled();
  });

  it.each(["subjective", "objective"] as const)(
    "%sを使い切ってもアイコンを残し、選択表示を外して追加操作を防ぐ",
    (kind) => {
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
      expect(
        screen.getByTestId(`dot-vote-sticker-icon-${otherKind}`),
      ).toBeVisible();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      fireEvent.click(exhausted);
      fireEvent.pointerDown(exhausted, { pointerId: 1 });
      expect(onStickerSelect).not.toHaveBeenCalled();
      expect(onStickerDragStart).not.toHaveBeenCalled();
    },
  );

  it("シールを戻す操作中も取り消しの案内は画面に出さず、読み上げでだけ伝える", () => {
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

    const palette = paletteRegion();
    expect(palette).toHaveAttribute("data-return-drop-target", "true");
    expect(visibleText(palette)).not.toContain("取り消");
    expect(palette).toHaveAccessibleDescription(
      /投票パレットへ戻すと、その1票を取り消せます。/,
    );
  });

  it("投票の失敗を表示して読み上げる", () => {
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

  it("2種類のシールはクリック選択とドラッグ開始の両方を通知する", () => {
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
      name: "「需要ありそう」シール 残り2票",
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

  it("選択中のシールは押下状態で示し、案内文は出さない", () => {
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
      screen.getByRole("button", { name: "「イチオシ！」シール 残り1票" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
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
      name: "「イチオシ！」シール 残り0票",
    });
    const objective = screen.getByRole("button", {
      name: "「需要ありそう」シール 残り2票",
    });

    expect(subjective).toHaveClass(
      "disabled:opacity-100",
      "border-dashed",
      "disabled:bg-muted",
      "disabled:text-muted-foreground",
      "active:cursor-grabbing",
    );
    expect(subjective).not.toHaveClass("border-vote-subjective");
    expect(
      within(subjective).queryByTestId("dot-vote-selected-check-subjective"),
    ).not.toBeInTheDocument();
    expect(objective).toHaveClass(
      "active:cursor-grabbing",
      "border-border",
      "bg-white",
    );
    expect(
      within(objective).queryByTestId("dot-vote-selected-check-objective"),
    ).not.toBeInTheDocument();

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

    const selected = screen.getByRole("button", {
      name: "「需要ありそう」シール 残り2票",
    });
    expect(selected).toHaveClass(
      "border-vote-objective",
      "bg-vote-objective-soft",
    );
    expect(
      within(selected).getByTestId("dot-vote-selected-check-objective"),
    ).toBeInTheDocument();
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
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
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
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
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
      name: "「需要ありそう」シール 残り1票",
    });
    expect(objective).toBeEnabled();
    fireEvent.click(objective);
    expect(props.onStickerSelect).toHaveBeenCalledWith(
      "objective",
      expect.anything(),
    );
  });

  it("投票の失敗は画面に表示し、成功の結果は表示しない", () => {
    const props: DotVotePaletteProps = {
      voteRemaining: { subjective: 0, objective: 1 },
      pendingOperationCount: 0,
      feedback: { state: "failed", message: "投票を送信できませんでした。" },
      disabled: false,
      selectedKind: null,
      onStickerSelect: vi.fn(),
      onStickerDragStart: vi.fn(),
    };
    const { rerender } = render(<DotVotePalette {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "投票を送信できませんでした。",
    );
    expect(screen.getByRole("status")).toBeVisible();
    expect(screen.getByRole("status")).not.toHaveClass("sr-only");

    rerender(
      <DotVotePalette
        {...props}
        feedback={{ state: "confirmed", message: "投票を1票取り消しました。" }}
      />,
    );
    expect(visibleText(paletteRegion())).not.toContain(
      "投票を1票取り消しました。",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("タイマー停止中はクリックとドラッグを通知せず、再開後に選べる", () => {
    const props: DotVotePaletteProps = {
      voteRemaining: { subjective: 1, objective: 3 },
      pendingOperationCount: 0,
      feedback: null,
      disabled: false,
      interactionBlocked: true,
      selectedKind: "subjective",
      onStickerSelect: vi.fn(),
      onStickerDragStart: vi.fn(),
    };
    const { rerender } = render(<DotVotePalette {...props} />);
    const button = screen.getByRole("button", {
      name: "「イチオシ！」シール 残り1票",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    fireEvent.pointerDown(button, { pointerId: 1 });
    expect(props.onStickerSelect).not.toHaveBeenCalled();
    expect(props.onStickerDragStart).not.toHaveBeenCalled();

    rerender(<DotVotePalette {...props} interactionBlocked={false} />);
    expect(button).toBeEnabled();
    fireEvent.click(button);
    fireEvent.pointerDown(button, { pointerId: 1 });
    expect(props.onStickerSelect).toHaveBeenCalledOnce();
    expect(props.onStickerDragStart).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "通信切断中は操作制限が%sでも、古い成功表示や再接続待ちの文言を出さずに操作を止める",
    (interactionBlocked) => {
      render(
        <DotVotePalette
          voteRemaining={{ subjective: 0, objective: 3 }}
          pendingOperationCount={1}
          feedback={{ state: "confirmed", message: "投票を反映しました。" }}
          disabled
          interactionBlocked={interactionBlocked}
          selectedKind={null}
          onStickerSelect={vi.fn()}
          onStickerDragStart={vi.fn()}
        />,
      );
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(screen.queryByText("使い切りました")).not.toBeInTheDocument();
      for (const button of screen.getAllByRole("button"))
        expect(button).toBeDisabled();
    },
  );

  it("タイマー停止中も残票ゼロの種類は使い切りを示し、再開しても選べない", () => {
    const props: DotVotePaletteProps = {
      voteRemaining: { subjective: 0, objective: 3 },
      pendingOperationCount: 0,
      feedback: null,
      disabled: false,
      interactionBlocked: true,
      selectedKind: null,
      onStickerSelect: vi.fn(),
      onStickerDragStart: vi.fn(),
    };
    const { rerender } = render(<DotVotePalette {...props} />);
    const subjective = screen.getByRole("button", {
      name: "「イチオシ！」シール 残り0票",
    });
    expect(within(subjective).getByText("使い切りました")).toBeVisible();
    expect(screen.queryByText("接続待ち")).not.toBeInTheDocument();
    expect(subjective).toBeDisabled();

    rerender(<DotVotePalette {...props} interactionBlocked={false} />);
    expect(subjective).toBeDisabled();
    fireEvent.click(subjective);
    fireEvent.pointerDown(subjective, { pointerId: 1 });
    expect(props.onStickerSelect).not.toHaveBeenCalled();
    expect(props.onStickerDragStart).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "「需要ありそう」シール 残り3票" }),
    ).toBeEnabled();
  });
});
