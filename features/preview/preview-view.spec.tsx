import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PreviewView } from "./preview-view";

it("14ステップを選べ、準備中の二重作成を防ぐ", () => {
  const onCreate = vi.fn();
  const { rerender } = render(
    <PreviewView
      pending={false}
      error={null}
      partner={false}
      onCreate={onCreate}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /3-5/ }));
  expect(onCreate).toHaveBeenCalledWith("3-5");
  expect(screen.getAllByRole("button")).toHaveLength(14);
  rerender(
    <PreviewView
      pending={true}
      error={null}
      partner={false}
      onCreate={onCreate}
    />,
  );
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
      partner={false}
      onCreate={onCreate}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("準備に失敗");
  fireEvent.click(screen.getByRole("button", { name: /1-1/ }));
  expect(onCreate).toHaveBeenCalledWith("1-1");
});
it("LPを未ログイン表示とログイン済み表示で開く入口を示す", () => {
  render(
    <PreviewView
      pending={false}
      error={null}
      partner={false}
      onCreate={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("link", { name: "未ログインでトップを開く" }),
  ).toHaveAttribute("href", "/preview/signed-out");
  expect(
    screen.getByRole("link", { name: "ログイン済みで説明ページを開く" }),
  ).toHaveAttribute("href", "/about");
});
it("本人のブラウザでは、相手役に切り替える入口を示す", () => {
  render(
    <PreviewView
      pending={false}
      error={null}
      partner={false}
      onCreate={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("link", { name: "このブラウザを相手役にする" }),
  ).toHaveAttribute("href", "/preview/partner");
});
it("相手役のブラウザでは、相手役であることと本人に戻す入口を示す", () => {
  render(
    <PreviewView
      pending={false}
      error={null}
      partner={true}
      onCreate={vi.fn()}
    />,
  );
  expect(screen.getByText(/このブラウザは相手役です/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "本人に戻す" })).toHaveAttribute(
    "href",
    "/preview/self",
  );
});
