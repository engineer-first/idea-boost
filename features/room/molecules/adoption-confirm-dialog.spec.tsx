import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AdoptionConfirmDialog } from "./adoption-confirm-dialog";

it("対象本文と作者、最終フェーズの下書き破棄を示して確認する", () => {
  const onConfirm = vi.fn();
  render(
    <AdoptionConfirmDialog
      target={{ content: "選んだ案", authorName: "はな" }}
      phaseNumber={3}
      disabled={false}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  expect(screen.getByRole("alertdialog")).toHaveTextContent("はな");
  expect(screen.getByRole("alertdialog")).toHaveTextContent("下書きは破棄");
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "このアイデアに決定" }));
  expect(onConfirm).toHaveBeenCalledOnce();
});
