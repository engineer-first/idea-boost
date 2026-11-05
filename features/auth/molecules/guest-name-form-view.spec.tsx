import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GuestNameFormView } from "./guest-name-form-view";

it("15文字では案内せず16文字でエラーを示して開始を止める", () => {
  const props = {
    name: "あ".repeat(15),
    pending: false,
    error: null,
    onNameChange: vi.fn(),
    onSubmit: vi.fn(),
  };
  const { rerender } = render(<GuestNameFormView {...props} />);
  expect(screen.queryByText(/15文字以内/)).not.toBeInTheDocument();
  rerender(<GuestNameFormView {...props} name={"あ".repeat(16)} />);
  expect(screen.getByRole("alert")).toHaveTextContent("15文字以内");
  expect(screen.getByRole("button")).toBeDisabled();
});
