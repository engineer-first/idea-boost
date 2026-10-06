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
it("呼び名入力から保存・取消へ接続し失敗した入力も表示する", () => {
  const { rerender } = render(<RoomDisplayNameDialog controls={controls} />);
  fireEvent.change(screen.getByRole("textbox", { name: "呼び名" }), {
    target: { value: "別の呼び名" },
  });
  expect(controls.onDraftChange).toHaveBeenCalledWith("別の呼び名");
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
