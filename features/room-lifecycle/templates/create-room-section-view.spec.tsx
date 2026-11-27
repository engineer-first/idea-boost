import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CreateRoomSectionView } from "./create-room-section-view";

it("30文字を受け付け31文字でエラーと作成不可を示す", () => {
  render(<CreateRoomSectionView onSubmit={vi.fn()} />);
  const input = screen.getByRole("textbox", { name: "テーマ（任意）" });
  fireEvent.change(input, { target: { value: "あ".repeat(30) } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "あ".repeat(31) } });
  expect(input).toHaveValue("あ".repeat(31));
  expect(screen.getByRole("alert")).toHaveTextContent("30文字以内");
  expect(
    screen.getByRole("button", { name: "新しいルームを作成" }),
  ).toBeDisabled();
});

it("テーマの例はプレースホルダーで示し、エラーが無い間は読み上げの説明を付けない", () => {
  render(<CreateRoomSectionView onSubmit={vi.fn()} />);
  const input = screen.getByRole("textbox", { name: "テーマ（任意）" });
  expect(input).toHaveAttribute(
    "placeholder",
    "例：アプリをもっと使ってもらうには",
  );
  expect(input).not.toHaveAttribute("aria-describedby");
});

it("テーマの例はそのまま入力しても文字数上限に収まる", () => {
  render(<CreateRoomSectionView onSubmit={vi.fn()} />);
  const input = screen.getByRole("textbox", { name: "テーマ（任意）" });
  const example = (input.getAttribute("placeholder") ?? "").replace(
    /^例：/,
    "",
  );
  fireEvent.change(input, { target: { value: example } });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
