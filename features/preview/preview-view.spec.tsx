import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PreviewView } from "./preview-view";

it("14ステップを選べ、準備中の二重作成を防ぐ", () => {
  const onCreate = vi.fn();
  const { rerender } = render(
    <PreviewView pending={false} error={null} onCreate={onCreate} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /3-5/ }));
  expect(onCreate).toHaveBeenCalledWith("3-5");
  expect(screen.getAllByRole("button")).toHaveLength(14);
  rerender(<PreviewView pending={true} error={null} onCreate={onCreate} />);
  expect(
    screen
      .getAllByRole("button")
      .every((button) => button.hasAttribute("disabled")),
  ).toBe(true);
  expect(screen.getByRole("status")).toBeInTheDocument();
});
it("失敗理由を表示して、別の新規ルーム作成を試せる", () => {
  const onCreate = vi.fn();
  render(
    <PreviewView
      pending={false}
      error="準備に失敗しました。"
      onCreate={onCreate}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("準備に失敗");
  fireEvent.click(screen.getByRole("button", { name: /1-1/ }));
  expect(onCreate).toHaveBeenCalledWith("1-1");
});
