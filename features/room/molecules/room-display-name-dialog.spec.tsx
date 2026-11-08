import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RoomDisplayNameDialog } from "./room-display-name-dialog";

const controls = {
  open: true,
  draft: "はな",
  pending: false,
  error: null,
  disabled: false,
  request: vi.fn(),
  onDraftChange: vi.fn(),
  onOpenChange: vi.fn(),
  onConfirm: vi.fn(),
};
it("表示名入力から保存・取消へ接続し失敗した入力も表示する", () => {
  const { rerender } = render(<RoomDisplayNameDialog controls={controls} />);
  fireEvent.change(screen.getByRole("textbox", { name: "表示名" }), {
    target: { value: "別の表示名" },
  });
  expect(controls.onDraftChange).toHaveBeenCalledWith("別の表示名");
  fireEvent.click(screen.getByRole("button", { name: "保存する" }));
  expect(controls.onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(controls.onOpenChange).toHaveBeenCalledWith(false);
  rerender(
    <RoomDisplayNameDialog
      controls={{ ...controls, draft: "入力保持", error: "送信に失敗しました" }}
    />,
  );
  expect(screen.getByRole("textbox")).toHaveValue("入力保持");
  expect(screen.getByRole("alert")).toHaveTextContent("送信に失敗");
});
it("保存中は入力・保存・取消を止める", () => {
  render(<RoomDisplayNameDialog controls={{ ...controls, pending: true }} />);
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
});

it("15文字では案内せず16文字でエラーを出して保存を止め、短くすると解除する", () => {
  const c = {
    ...controls,
    open: true,
    draft: "あ".repeat(15),
    onConfirm: vi.fn(),
  };
  const { rerender } = render(<RoomDisplayNameDialog controls={c} />);
  expect(screen.queryByText(/15文字以内/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存する" })).toBeEnabled();
  rerender(
    <RoomDisplayNameDialog controls={{ ...c, draft: "あ".repeat(16) }} />,
  );
  expect(screen.getByRole("textbox")).toHaveValue("あ".repeat(16));
  expect(screen.getByRole("alert")).toHaveTextContent("15文字以内");
  expect(screen.getByRole("button", { name: "保存する" })).toBeDisabled();
  const form = screen.getByRole("textbox").closest("form");
  if (!form) throw new Error("入力フォームがありません");
  fireEvent.submit(form);
  expect(c.onConfirm).not.toHaveBeenCalled();
  rerender(<RoomDisplayNameDialog controls={c} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存する" })).toBeEnabled();
});
it("文字数超過では保存済みの確認を出さず、保存の失敗では出す", () => {
  const c = { ...controls, open: true, onRetry: vi.fn() };
  const { rerender } = render(
    <RoomDisplayNameDialog controls={{ ...c, draft: "あ".repeat(16) }} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("15文字以内");
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
    expect.not.arrayContaining([expect.stringContaining("確認")]),
  );
  rerender(
    <RoomDisplayNameDialog
      controls={{ ...c, draft: "はな", error: "保存できませんでした。" }}
    />,
  );
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
    expect.arrayContaining([expect.stringContaining("確認")]),
  );
});
