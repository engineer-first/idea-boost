import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DisplayNameControls } from "../logic/use-display-name";
import { DisplayNameDialog } from "./display-name-dialog";

function controls(): DisplayNameControls {
  return {
    open: true,
    draft: "",
    pending: false,
    loading: false,
    optional: true,
    error: null,
    request: vi.fn(),
    beforeEntry: vi.fn(),
    onDraftChange: vi.fn(),
    onConfirm: vi.fn(),
    onOpenChange: vi.fn(),
    onSkip: vi.fn(),
    onRetry: vi.fn(),
  };
}
describe("任意の表示名入力", () => {
  it("スキップ・保存・取消を接続し、Google名の初期値を使わない", () => {
    const c = controls();
    render(<DisplayNameDialog controls={c} />);
    expect(screen.getByRole("textbox", { name: "表示名（任意）" })).toHaveValue(
      "",
    );
    fireEvent.click(screen.getByRole("button", { name: "入力せずに進む" }));
    expect(c.onSkip).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "保存して進む" }));
    expect(c.onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(c.onOpenChange).toHaveBeenCalledWith(false);
  });
  it("保存中の二重操作を防ぎ、失敗後は入力とエラーから再試行できる", () => {
    const c = controls();
    const { rerender } = render(
      <DisplayNameDialog controls={{ ...c, pending: true, draft: "はな" }} />,
    );
    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "入力せずに進む" }),
    ).toBeDisabled();
    rerender(
      <DisplayNameDialog
        controls={{
          ...c,
          draft: "はな",
          error: "通信を確認してもう一度保存してください。",
        }}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("はな");
    expect(screen.getByRole("alert")).toHaveTextContent("通信");
    fireEvent.click(screen.getByRole("button", { name: "保存して進む" }));
    expect(c.onConfirm).toHaveBeenCalledOnce();
  });
});
