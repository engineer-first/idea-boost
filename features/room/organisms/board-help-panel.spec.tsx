import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardHelpPanel, type BoardHelpPanelProps } from "./board-help-panel";

function setup(overrides: Partial<BoardHelpPanelProps> = {}) {
  const props: BoardHelpPanelProps = {
    kind: "idea",
    isOpen: true,
    tab: "write",
    disabled: false,
    onOpenChange: vi.fn(),
    onTabChange: vi.fn(),
    onHmwTemplateSelect: vi.fn(),
    onIdeaHintSelect: vi.fn(),
    ...overrides,
  };
  const rendered = render(<BoardHelpPanel {...props} />);
  return { props, ...rendered };
}

describe("BoardHelpPanel", () => {
  it("書き出しと発想支援を同じ左パネルのタブへまとめる", () => {
    const { props, rerender } = setup();
    expect(screen.getByTestId("board-help-panel")).toHaveClass("left-3");
    expect(screen.getByTestId("idea-guide-panel")).toBeVisible();
    const tab = screen.getByRole("tab", { name: "発想を広げる" });
    fireEvent.mouseDown(tab, { button: 0 });
    expect(props.onTabChange).toHaveBeenCalledWith("expand");
    rerender(<BoardHelpPanel {...props} tab="expand" />);
    expect(screen.getByText("オズボーンのチェックリスト")).toBeVisible();
    expect(screen.queryByTestId("idea-guide-panel")).not.toBeInTheDocument();
  });

  it("閉じると説明だけが消え、再び開く入口が残る", () => {
    const { props, rerender } = setup();
    fireEvent.click(
      screen.getByRole("button", { name: "考えるヒントを閉じる" }),
    );
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    rerender(<BoardHelpPanel {...props} isOpen={false} />);
    expect(screen.queryByTestId("idea-guide-panel")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "考えるヒントを開く" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("Escapeで閉じて開閉ボタンへフォーカスを戻す", () => {
    const { props } = setup();
    const button = screen.getByRole("button", { name: "考えるヒントを閉じる" });
    fireEvent.keyDown(screen.getByTestId("board-help-panel"), {
      key: "Escape",
    });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(button).toHaveFocus();
  });

  it("HMWのテンプレートから従来どおり付箋を作れる", () => {
    const { props } = setup({ kind: "hmw" });
    const button = within(
      screen.getByTestId("hmw-template-panel"),
    ).getAllByRole("button")[0];
    fireEvent.click(button);
    expect(props.onHmwTemplateSelect).toHaveBeenCalledWith(button.textContent);
  });

  it("共有ステップは発想法の参照だけにし、書き出しの作成操作を表示しない", () => {
    setup({ kind: "reference" });
    expect(screen.queryByTestId("idea-guide-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "書き出し" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("オズボーンのチェックリスト")).toBeVisible();
  });

  it("補助が不要なステップでは開閉ボタンも表示しない", () => {
    const { container } = setup({ kind: null });
    expect(container).toBeEmptyDOMElement();
  });
});
