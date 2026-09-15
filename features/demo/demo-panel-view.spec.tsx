import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoPanelView, type DemoPanelViewProps } from "./demo-panel-view";

function props(
  overrides: Partial<DemoPanelViewProps> = {},
): DemoPanelViewProps {
  return {
    expanded: true,
    status: null,
    pending: false,
    error: null,
    checkpoint: "start",
    onToggle: vi.fn(),
    onAction: vi.fn(),
    onCheckpointChange: vi.fn(),
    onCreate: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}
describe("DemoPanelView", () => {
  it("折り畳むと通常操作を覆うパネルを隠す", () => {
    render(<DemoPanelView {...props({ expanded: false })} />);
    expect(screen.getByRole("button", { name: "デモ操作" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("見せ場へ移動")).not.toBeInTheDocument();
  });
  it("取得前は読み込み状態を表示する", () => {
    render(<DemoPanelView {...props()} />);
    expect(screen.getByRole("status")).toHaveTextContent("状況を読み込み中");
  });
  it("現在の場面で共有だけ可能なら投票ボタンを表示しない", () => {
    const p = props({
      status: {
        checkpoint: "share",
        phase: { kind: "step", phase: 1, step: 2 },
        availableActions: ["share"],
        sharedCount: 0,
        votedCount: 0,
      },
    });
    render(<DemoPanelView {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "他4人が共有する" }));
    expect(p.onAction).toHaveBeenCalledWith("share");
    expect(
      screen.queryByRole("button", { name: "他4人が投票する" }),
    ).not.toBeInTheDocument();
  });
  it("操作済みの人数と操作なしの場面を表示する", () => {
    render(
      <DemoPanelView
        {...props({
          status: {
            checkpoint: "complete",
            phase: { kind: "step", phase: 3, step: 5 },
            availableActions: [],
            sharedCount: 4,
            votedCount: 4,
          },
        })}
      />,
    );
    expect(screen.getByText(/共有 4\/4人・投票 4\/4人/)).toBeInTheDocument();
    expect(
      screen.getByText(/この場面では通常のボード操作/),
    ).toBeInTheDocument();
  });
  it("処理中は連打を防ぎ、エラー時は再取得できる", () => {
    const p = props({ pending: true, error: "操作に失敗しました。" });
    render(<DemoPanelView {...p} />);
    expect(screen.getByRole("alert")).toHaveTextContent("操作に失敗しました。");
    expect(screen.getByRole("button", { name: "見せ場へ移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "状況を再取得" })).toBeDisabled();
  });
});

it("グループの合図と自動・手動・入力例を区別して表示する", () => {
  const p = props({
    status: {
      checkpoint: "grouping",
      phase: { kind: "step", phase: 1, step: 3 },
      availableActions: ["group"],
      sharedCount: 4,
      votedCount: 0,
    },
  });
  render(<DemoPanelView {...p} />);
  expect(
    screen.getByRole("heading", { name: "このステップで伝えること" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "自動で用意するもの" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "あなたが操作すること" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "入力・説明に使う具体例" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("空きコマに学び合える仲間がほしい"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "グループ例を配置する" }));
  expect(p.onAction).toHaveBeenCalledWith("group");
});
