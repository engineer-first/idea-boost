import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { buildRoomNameControls } from "../logic/room-name.fixture";
import { RoomNameDialog } from "./room-name-dialog";

it("入力・保存・キャンセルを接続し、保存中は入力と二重操作を防ぐ", () => {
  const controls = buildRoomNameControls({
    open: true,
    onDraftChange: vi.fn(),
    onConfirm: vi.fn(),
    onOpenChange: vi.fn(),
  });
  const { rerender } = render(<RoomNameDialog controls={controls} />);
  fireEvent.change(screen.getByLabelText("ルーム名", { exact: true }), {
    target: { value: "J06" },
  });
  expect(controls.onDraftChange).toHaveBeenCalledWith("J06");
  fireEvent.click(screen.getByRole("button", { name: "保存する" }));
  expect(controls.onConfirm).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  expect(controls.onOpenChange).toHaveBeenCalledWith(false);
  rerender(<RoomNameDialog controls={{ ...controls, pending: true }} />);
  expect(screen.getByLabelText("ルーム名", { exact: true })).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
});

it("15文字では案内せず16文字でエラーを出して保存を止め、短くすると解除する", () => {
  const controls = buildRoomNameControls({
    open: true,
    draft: "あ".repeat(15),
    onConfirm: vi.fn(),
  });
  const { rerender } = render(<RoomNameDialog controls={controls} />);
  expect(screen.queryByText(/15文字以内/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存する" })).toBeEnabled();
  rerender(
    <RoomNameDialog controls={{ ...controls, draft: "あ".repeat(16) }} />,
  );
  expect(screen.getByRole("textbox")).toHaveValue("あ".repeat(16));
  expect(screen.getByRole("alert")).toHaveTextContent("15文字以内");
  expect(screen.getByRole("button", { name: "保存する" })).toBeDisabled();
  const form = screen.getByRole("textbox").closest("form");
  if (!form) throw new Error("入力フォームがありません");
  fireEvent.submit(form);
  expect(controls.onConfirm).not.toHaveBeenCalled();
  rerender(<RoomNameDialog controls={controls} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存する" })).toBeEnabled();
});
