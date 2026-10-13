import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DisplayNameControls } from "../logic/use-display-name";
import { DisplayNameDialog } from "./display-name-dialog";

function controls(): DisplayNameControls {
  return {
    open: true,
    draft: "Googleの名前",
    pending: false,
    loading: false,
    error: null,
    request: vi.fn(),
    onDraftChange: vi.fn(),
    onConfirm: vi.fn(),
    onOpenChange: vi.fn(),
    onRetry: vi.fn(),
  };
}
describe("本人が開く表示名の変更", () => {
  it("現在のGoogle名を表示して保存・取消を接続する", () => {
    const c = controls();
    render(<DisplayNameDialog controls={c} />);
    expect(screen.getByRole("textbox", { name: "表示名" })).toHaveValue(
      "Googleの名前",
    );
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
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
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    expect(c.onConfirm).toHaveBeenCalledOnce();
  });
});
