import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NOTE_CONTENT_MAX_LENGTH } from "@/contracts/room-protocol";
import { HmwHintCharacter } from "./hmw-hint-character";

async function openHints() {
  await userEvent.click(
    screen.getByRole("button", { name: "問いのヒントを開く" }),
  );
  return screen.getByRole("dialog", { name: "問いのヒント" });
}

describe("キャラクターの問いヒント", () => {
  it("別の3つへ切り替え、選んだ問いを編集してから新規付箋へ渡す", async () => {
    const onUseQuestion = vi.fn();
    render(
      <HmwHintCharacter
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
    const input = within(dialog).getByRole("textbox", { name: "問いの文例" });
    expect((input as HTMLTextAreaElement).value).toContain("忘れ物が多い");
    fireEvent.change(input, {
      target: { value: "そもそも、覚えておく必要があるのかな？" },
    });
    expect(onUseQuestion).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "この問いを使う" }),
    );
    expect(onUseQuestion).toHaveBeenCalledExactlyOnceWith(
      "そもそも、覚えておく必要があるのかな？",
    );
  });

  it("課題を取得できない間は文例を作らず、届いた課題から選び直せる", async () => {
    const onUseQuestion = vi.fn();
    const { rerender } = render(
      <HmwHintCharacter decidedIssue={null} onUseQuestion={onUseQuestion} />,
    );
    const dialog = await openHints();
    expect(
      within(dialog).queryByRole("group", { name: "考え方のワード" }),
    ).not.toBeInTheDocument();
    rerender(
      <HmwHintCharacter
        decidedIssue="買い物を忘れる"
        onUseQuestion={onUseQuestion}
      />,
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "解消" }));
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "問いの文例",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain("買い物を忘れる");
  });

  it("作成待ちや操作できない状態では二重に付箋を作成しない", async () => {
    const onUseQuestion = vi.fn();
    const { rerender } = render(
      <HmwHintCharacter
        decidedIssue="忘れ物が多い"
        onUseQuestion={onUseQuestion}
      />,
    );
    const dialog = await openHints();
    await userEvent.click(within(dialog).getByRole("button", { name: "解消" }));
    rerender(
      <HmwHintCharacter
        decidedIssue="忘れ物が多い"
        onUseQuestion={onUseQuestion}
        pending
      />,
    );
    expect(
      within(dialog).getByRole("button", { name: "この問いを使う" }),
    ).toBeDisabled();
    rerender(
      <HmwHintCharacter
        decidedIssue="忘れ物が多い"
        onUseQuestion={onUseQuestion}
        disabled
      />,
    );
    expect(
      within(dialog).getByRole("button", { name: "この問いを使う" }),
    ).toBeDisabled();
    expect(onUseQuestion).not.toHaveBeenCalled();
  });

  it("長い課題を切り捨てず、文例を文字数内へ編集すると使える", async () => {
    render(
      <HmwHintCharacter
        decidedIssue={"長".repeat(NOTE_CONTENT_MAX_LENGTH)}
        onUseQuestion={vi.fn()}
      />,
    );
    const dialog = await openHints();
    await userEvent.click(within(dialog).getByRole("button", { name: "解消" }));
    const input = within(dialog).getByRole("textbox", { name: "問いの文例" });
    expect((input as HTMLTextAreaElement).value).toContain(
      "長".repeat(NOTE_CONTENT_MAX_LENGTH),
    );
    expect(
      within(dialog).getByRole("button", { name: "この問いを使う" }),
    ).toBeDisabled();
    fireEvent.change(input, { target: { value: "短く編集した問い" } });
    expect(
      within(dialog).getByRole("button", { name: "この問いを使う" }),
    ).toBeEnabled();
  });
});
