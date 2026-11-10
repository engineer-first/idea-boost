import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { getNoteHeight, NOTE_DEFAULT_FONT_SIZE } from "@/contracts/board";
import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";
import { HmwHintCharacter } from "./hmw-hint-character";

async function openHints() {
  await userEvent.click(
    screen.getByRole("button", { name: "問いのヒントを開く" }),
  );
  return screen.getByRole("dialog", { name: "問いのヒント" });
}

describe("キャラクターの問いヒント", () => {
  it("書き出し演出を終えてもキャラクターは消えず、再計時の合図だけを出す", () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const onUseQuestion = vi.fn();
    const onFadeOutComplete = vi.fn();
    const props = {
      decidedIssue: "忘れ物が多い",
      onUseQuestion,
      showNudge: true,
      onFadeOutComplete,
    };
    const { rerender } = render(<HmwHintCharacter {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "問いのヒントを開く" }));
    fireEvent.click(screen.getByRole("button", { name: "楽しみ" }));
    fireEvent.click(screen.getByRole("button", { name: "この問いにする" }));
    rerender(<HmwHintCharacter {...props} pending />);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByTestId("hmw-hint-character")).toBeInTheDocument();
    expect(onFadeOutComplete).not.toHaveBeenCalled();
    rerender(<HmwHintCharacter {...props} pending={false} />);
    act(() => vi.advanceTimersByTime(1_399));
    expect(onFadeOutComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onFadeOutComplete).toHaveBeenCalledOnce();
    // フェードアウトは廃止済み。書き出し後も2-1の間は表示を続ける。
    expect(screen.getByTestId("hmw-hint-character")).toBeInTheDocument();
    expect(onUseQuestion).toHaveBeenCalledExactlyOnceWith(
      "どうやったら忘れ物が多いを楽しめるだろう？",
    );
  });

  it("2-1ではキャラクターと呼びかけの吹き出しを常に表示する", async () => {
    const onDismissNudge = vi.fn();
    const { rerender } = render(
      <HmwHintCharacter
        decidedIssue="忘れ物が多い"
        onUseQuestion={vi.fn()}
        onDismissNudge={onDismissNudge}
      />,
    );
    // 呼びかけ条件を待たずに、キャラクターと吹き出しを最初から出す。
    expect(
      screen.getByRole("button", { name: /こんな見た目も.*あるかも/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "問いのヒントを開く" }),
    ).toBeInTheDocument();
    // 吹き出しから開いた popover が閉じれば、吹き出しは表示に戻る。
    await userEvent.click(
      screen.getByRole("button", { name: "問いのヒントを開く" }),
    );
    expect(
      screen.queryByRole("button", { name: /こんな見た目も.*あるかも/ }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: /こんな見た目も.*あるかも/ }),
    ).toBeInTheDocument();
    rerender(
      <HmwHintCharacter
        decidedIssue="忘れ物が多い"
        onUseQuestion={vi.fn()}
        onDismissNudge={onDismissNudge}
        showNudge
      />,
    );
    expect(
      screen.getByRole("button", { name: /こんな見た目も.*あるかも/ }),
    ).toBeInTheDocument();
    // 閉じたら次の書き出し周期まで消えたままにする。
    await userEvent.click(
      screen.getByRole("button", { name: "呼びかけを閉じる" }),
    );
    expect(onDismissNudge).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /こんな見た目も.*あるかも/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "問いのヒントを開く" }),
    ).toBeInTheDocument();
  });

  it("問いの文例は生成する付箋と同じ高さで表示する", async () => {
    render(
      <HmwHintCharacter
        showNudge
        decidedIssue="忘れ物が多い"
        onUseQuestion={vi.fn()}
      />,
    );
    const dialog = await openHints();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "楽しみ" }),
    );
    const question = "どうやったら忘れ物が多いを楽しめるだろう？";
    const expected = getNoteHeight(question, NOTE_DEFAULT_FONT_SIZE);
    expect(
      within(dialog).getByRole("region", { name: "問いの文例" }),
    ).toHaveStyle({ height: `${expected}px` });
  });

  it("呼びかけの吹き出しからも3ワードを開き、例題から同じワード選択へ戻れる", async () => {
    const onHintOpen = vi.fn();
    const onUseQuestion = vi.fn();
    render(
      <HmwHintCharacter
        decidedIssue="忘れ物が多い"
        onUseQuestion={onUseQuestion}
        onHintOpen={onHintOpen}
        showNudge
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /こんな見た目も.*あるかも/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "問いのヒント" });
    expect(onHintOpen).toHaveBeenCalledOnce();
    expect(
      within(dialog).getByRole("button", { name: "楽しみ" }),
    ).toHaveFocus();
    const firstWords = within(dialog).getByRole("group", {
      name: "考え方のワード",
    }).textContent;
    await userEvent.click(
      within(dialog).getByRole("button", { name: "楽しみ" }),
    );
    expect(
      within(dialog).queryByRole("group", { name: "考え方のワード" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("region", { name: "問いの文例" }),
    ).toHaveTextContent("忘れ物が多い");
    expect(
      within(dialog).getByRole("region", { name: "問いの文例" }),
    ).toHaveFocus();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "別のワードを選択する" }),
    );
    expect(
      within(dialog).getByRole("group", { name: "考え方のワード" }),
    ).toHaveTextContent(firstWords ?? "");
    expect(
      within(dialog).getByRole("button", { name: "楽しみ" }),
    ).toHaveFocus();
    expect(
      within(dialog).queryByRole("region", { name: "問いの文例" }),
    ).not.toBeInTheDocument();
    expect(onUseQuestion).not.toHaveBeenCalled();
  });

  it("別の3つへ切り替え、選んだ静止文例を決定したときだけ新規付箋へ渡す", async () => {
    const onUseQuestion = vi.fn();
    render(
      <HmwHintCharacter
        showNudge
        decidedIssue="忘れ物が多い"
        onUseQuestion={onUseQuestion}
      />,
    );
    const dialog = await openHints();
    const words = within(dialog).getByRole("group", { name: "考え方のワード" });
    const first = within(words)
      .getAllByRole("button")
      .map((button) => button.textContent);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "別の3つ" }),
    );
    const next = within(words).getAllByRole("button");
    expect(next).toHaveLength(3);
    expect(next.every((button) => !first.includes(button.textContent))).toBe(
      true,
    );
    await userEvent.click(next[0]);
    const question = "どうしたら、「忘れ物が多い」が起きる回数を減らせるか？";
    expect(
      within(dialog).getByRole("region", { name: "問いの文例" }),
    ).toHaveTextContent(question);
    expect(onUseQuestion).not.toHaveBeenCalled();
    await userEvent.dblClick(
      within(dialog).getByRole("button", { name: "この問いにする" }),
    );
    expect(onUseQuestion).toHaveBeenCalledExactlyOnceWith(question);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("課題を取得できない間は文例を作らず、届いた課題から選び直せる", async () => {
    const onUseQuestion = vi.fn();
    const { rerender } = render(
      <HmwHintCharacter
        showNudge
        decidedIssue={null}
        onUseQuestion={onUseQuestion}
      />,
    );
    const dialog = await openHints();
    expect(
      within(dialog).queryByRole("group", { name: "考え方のワード" }),
    ).not.toBeInTheDocument();
    rerender(
      <HmwHintCharacter
        showNudge
        decidedIssue="買い物を忘れる"
        onUseQuestion={onUseQuestion}
      />,
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "楽しみ" }),
    );
    expect(
      within(dialog).getByRole("region", { name: "問いの文例" }),
    ).toHaveTextContent("買い物を忘れる");
    rerender(
      <HmwHintCharacter
        showNudge
        decidedIssue="約束を忘れる"
        onUseQuestion={onUseQuestion}
      />,
    );
    expect(
      within(dialog).queryByRole("region", { name: "問いの文例" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "楽しみ" }),
    );
    expect(
      within(dialog).getByRole("region", { name: "問いの文例" }),
    ).toHaveTextContent("約束を忘れる");
  });

  it("作成待ちでも例題を閲覧でき、作成待ちや操作不可では採用できない", async () => {
    const onUseQuestion = vi.fn();
    const { rerender } = render(
      <HmwHintCharacter
        showNudge
        decidedIssue="忘れ物が多い"
        onUseQuestion={onUseQuestion}
        pending
      />,
    );
    const dialog = await openHints();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "楽しみ" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "この問いにする" }),
    ).toBeDisabled();
    rerender(
      <HmwHintCharacter
        showNudge
        decidedIssue="忘れ物が多い"
        onUseQuestion={onUseQuestion}
        disabled
      />,
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "この問いにする" }),
    );
    expect(onUseQuestion).not.toHaveBeenCalled();
    expect(
      within(dialog).getByRole("button", { name: "別のワードを選択する" }),
    ).toBeEnabled();
  });

  it("文字数を超えた課題も切り捨てずに表示し、付箋への採用を止める", async () => {
    render(
      <HmwHintCharacter
        showNudge
        decidedIssue={"長".repeat(NOTE_CONTENT_MAX_LENGTH)}
        onUseQuestion={vi.fn()}
      />,
    );
    const dialog = await openHints();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "楽しみ" }),
    );
    expect(
      within(dialog).getByRole("region", { name: "問いの文例" }),
    ).toHaveTextContent("長".repeat(NOTE_CONTENT_MAX_LENGTH));
    expect(within(dialog).getByRole("alert")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "この問いにする" }),
    ).toBeDisabled();
  });

  it("呼びかけを閉じてもワード選択を開かない", async () => {
    const onDismissNudge = vi.fn();
    render(
      <HmwHintCharacter
        decidedIssue="忘れ物が多い"
        onUseQuestion={vi.fn()}
        onDismissNudge={onDismissNudge}
        showNudge
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "呼びかけを閉じる" }),
    );
    expect(onDismissNudge).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /こんな見た目も.*あるかも/ }),
    ).not.toBeInTheDocument();
  });
});
