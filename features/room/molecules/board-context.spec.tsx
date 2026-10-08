import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { BoardContext } from "./board-context";

describe("現在地と補足情報", () => {
  it.each([
    1, 2, 3,
  ] as const)("フェーズ%iの閉じた表示は番号と点だけで、概要で正式作業名を確認できる", (phase) => {
    render(
      <BoardContext
        phase={buildPhaseStep(2, phase)}
        hmwDecidedIssue={null}
        decidedHmw={null}
        onOpenFeedback={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: /現在地/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      phase === 2 ? "4" : "5",
    );
    expect(screen.queryByTestId("board-current-step")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "フィードバック" }),
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("board-current-step")).toBeVisible();
    expect(screen.getByRole("button", { name: "全手順を見る" })).toBeVisible();
    expect(screen.queryByText(/ゴール：/)).not.toBeInTheDocument();
  });

  it("全手順は現在フェーズから開き、閲覧タブを変えても現在地を変えず、再び開くと現在フェーズに戻る", () => {
    render(
      <BoardContext
        phase={buildPhaseStep(2, 2)}
        hmwDecidedIssue={null}
        decidedHmw={null}
      />,
    );
    const trigger = screen.getByRole("button", { name: /現在地/ });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "全手順を見る" }));
    expect(screen.getByRole("tab", { name: /問い/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("list", { name: "このフェーズの全手順" }).children,
    ).toHaveLength(4);
    expect(screen.getByText("問い共有").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: /アイデア/ }), {
      button: 0,
    });
    expect(
      screen.getByRole("list", { name: "このフェーズの全手順" }).children,
    ).toHaveLength(5);
    expect(trigger).toHaveTextContent("問いの整理");
    fireEvent.click(screen.getByRole("button", { name: "概要に戻る" }));
    expect(screen.getByTestId("board-current-step")).toHaveTextContent(
      "問い共有",
    );
    fireEvent.click(screen.getByRole("button", { name: "全手順を見る" }));
    expect(screen.getByRole("tab", { name: /問い/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("外側の付箋操作も実行し、Escapeでは現在地へフォーカスを戻す", () => {
    const onNote = vi.fn();
    render(
      <>
        <BoardContext
          phase={buildPhaseStep(3, 3)}
          hmwDecidedIssue={null}
          decidedHmw={null}
        />
        <button type="button" onClick={onNote}>
          付箋
        </button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: /現在地/ });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "全手順を見る" }));
    const note = screen.getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(note);
    fireEvent.click(note);
    expect(onNote).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    screen.getByRole("button", { name: "全手順を見る" }).focus();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("参照欄の開閉を保持し、ステップ変更時は現在地を畳む", () => {
    const props = {
      phase: buildPhaseStep(1, 2),
      hmwDecidedIssue: "決定済みの課題",
      decidedHmw: null,
    };
    const { rerender } = render(<BoardContext {...props} />);
    const reference = screen.getByRole("button", { name: "決定した課題" });
    fireEvent.click(reference);
    const trigger = screen.getByRole("button", { name: /現在地/ });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(reference).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger);
    rerender(<BoardContext {...props} phase={buildPhaseStep(2, 2)} />);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("2/4");
    expect(screen.queryByTestId("board-current-step")).not.toBeInTheDocument();
    rerender(<BoardContext {...props} />);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("概要からフィードバックを開くと畳まれ、常設入口へ復帰先を渡す", () => {
    const onOpenFeedback = vi.fn();
    render(
      <BoardContext
        phase={buildPhaseStep(1, 2)}
        hmwDecidedIssue={null}
        decidedHmw={null}
        onOpenFeedback={onOpenFeedback}
      />,
    );
    const trigger = screen.getByRole("button", { name: /現在地/ });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
    expect(onOpenFeedback).toHaveBeenCalledWith(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("開始前には点を表示しない", () => {
    render(
      <BoardContext
        phase={{ kind: "lobby" }}
        hmwDecidedIssue={null}
        decidedHmw={null}
      />,
    );
    expect(screen.getByRole("button", { name: /現在地/ })).toHaveTextContent(
      "開始待ち",
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("決定内容も初期は閉じ、同時に開く補足は1項目だけ", () => {
    render(
      <BoardContext
        phase={buildPhaseStep(1, 3)}
        hmwDecidedIssue="解決したい課題"
        decidedHmw="どうすれば解決できるだろうか？"
      />,
    );

    const hmw = screen.getByRole("button", { name: "決定した問い" });
    const issue = screen.getByRole("button", { name: "決定した課題" });
    expect(hmw).toHaveAttribute("aria-expanded", "false");
    expect(issue).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("どうすれば解決できるだろうか？"),
    ).not.toBeVisible();
    expect(screen.queryByText("解決したい課題")).not.toBeVisible();

    fireEvent.click(hmw);
    expect(hmw).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("どうすれば解決できるだろうか？")).toBeVisible();
    expect(screen.queryByText("解決したい課題")).not.toBeVisible();
    fireEvent.click(issue);
    expect(hmw).toHaveAttribute("aria-expanded", "false");
    expect(issue).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.queryByText("どうすれば解決できるだろうか？"),
    ).not.toBeVisible();
    expect(screen.getByText("解決したい課題")).toBeVisible();
  });
});

it("手順内をキーボードで読んでいる間の工程変更では常設入口にフォーカスを戻す", () => {
  const props = {
    phase: buildPhaseStep(1, 2),
    hmwDecidedIssue: null,
    decidedHmw: null,
  };
  const { rerender } = render(<BoardContext {...props} />);
  const trigger = screen.getByRole("button", { name: /現在地/ });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "全手順を見る" }));
  screen.getByRole("tab", { name: /問い/ }).focus();
  rerender(<BoardContext {...props} phase={buildPhaseStep(2, 2)} />);
  expect(trigger).toHaveFocus();
});
