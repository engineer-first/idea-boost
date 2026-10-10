import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildCarryover } from "@/contracts/room-protocol.fixture";
import { BoardContext } from "./board-context";

describe("現在地と補足情報", () => {
  it.each([
    1, 2, 3,
  ] as const)("フェーズ%iの閉じた表示は番号と点だけで、1回開くと3フェーズと正式作業名を確認できる", (phase) => {
    render(
      <BoardContext
        phase={buildPhaseStep(2, phase)}
        hmwDecidedIssue={null}
        decidedHmw={null}
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
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(
      screen.getByRole("list", { name: "このフェーズの全手順" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "全手順を見る" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "概要に戻る" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "閉じる" }),
    ).not.toBeInTheDocument();
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
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getByRole("tab", { name: /問い/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("board-current-step")).toHaveTextContent(
      "問い共有",
    );
    fireEvent.keyDown(document, { key: "Escape" });
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
    const note = screen.getByRole("button", { name: "付箋" });
    fireEvent.pointerDown(note);
    fireEvent.click(note);
    expect(onNote).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    screen.getByRole("tab", { name: /アイデア/ }).focus();
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
    expect(reference).toHaveAttribute("aria-expanded", "true");
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

  it("フェーズ3では問いから開き、参照は一度に1項目だけ", () => {
    render(
      <BoardContext
        phase={buildPhaseStep(1, 3)}
        hmwDecidedIssue="解決したい課題"
        decidedHmw="どうすれば解決できるだろうか？"
      />,
    );

    const hmw = screen.getByRole("button", { name: "決定した問い" });
    const issue = screen.getByRole("button", { name: "決定した課題" });
    expect(hmw).toHaveAttribute("aria-expanded", "true");
    expect(issue).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("どうすれば解決できるだろうか？")).toBeVisible();
    expect(screen.queryByText("解決したい課題")).not.toBeVisible();

    fireEvent.click(hmw);
    expect(hmw).toHaveAttribute("aria-expanded", "false");
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
  screen.getByRole("tab", { name: /問い/ }).focus();
  rerender(<BoardContext {...props} phase={buildPhaseStep(2, 2)} />);
  expect(trigger).toHaveFocus();
});

it("現在より前の手順だけに完了マークを付け、別フェーズを見ても進行を変えない", () => {
  render(
    <BoardContext
      phase={buildPhaseStep(2, 2)}
      hmwDecidedIssue={null}
      decidedHmw={null}
    />,
  );
  const trigger = screen.getByRole("button", { name: /現在地/ });
  fireEvent.click(trigger);
  const steps = () =>
    within(screen.getByRole("list", { name: "このフェーズの全手順" }));
  expect(steps().getAllByRole("img", { name: "完了" })).toHaveLength(1);
  expect(
    steps().getByRole("img", { name: "完了" }).closest("li"),
  ).toHaveTextContent("課題に対する問い（個人）");
  expect(
    within(screen.getByTestId("board-current-step")).queryByRole("img", {
      name: "完了",
    }),
  ).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("tab", { name: /課題/ }), { button: 0 });
  expect(steps().getAllByRole("img", { name: "完了" })).toHaveLength(5);
  fireEvent.mouseDown(screen.getByRole("tab", { name: /アイデア/ }), {
    button: 0,
  });
  expect(steps().queryAllByRole("img", { name: "完了" })).toHaveLength(0);
  expect(trigger).toHaveTextContent("問いの整理・2/4");
});

it("閉じた参照を同一フェーズのステップ・データ更新で開かず、フェーズ入場で初期化する", () => {
  const props = {
    phase: buildPhaseStep(1, 2),
    hmwDecidedIssue: "課題本文",
    decidedHmw: null,
  };
  const { rerender } = render(<BoardContext {...props} />);
  const issue = screen.getByRole("button", { name: "決定した課題" });
  expect(issue).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(issue);
  rerender(
    <BoardContext
      {...props}
      phase={buildPhaseStep(2, 2)}
      hmwDecidedIssue="更新本文"
    />,
  );
  expect(issue).toHaveAttribute("aria-expanded", "false");
  rerender(
    <BoardContext
      {...props}
      phase={buildPhaseStep(1, 3)}
      decidedHmw="問い本文"
    />,
  );
  expect(screen.getByRole("button", { name: "決定した問い" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(issue).toHaveAttribute("aria-expanded", "false");
});

it("採用時の本文・文字サイズと集計票を表示し、参照から編集や投票を提供しない", () => {
  const reference = buildCarryover({
    content: "採用時の本文",
    color: "pink",
    fontSize: 20,
    dotVotes: { subjective: 7, objective: 3 },
  });
  render(
    <BoardContext
      phase={buildPhaseStep(1, 2)}
      hmwDecidedIssue={reference.content}
      decidedHmw={null}
      issueReference={reference}
    />,
  );
  const body = screen.getByRole("region", { name: "決定した課題の本文" });
  expect(body).toHaveTextContent(reference.content);
  expect(body).toHaveStyle({ fontSize: "20px" });
  expect(screen.getByRole("img", { name: /主観.*7票/ })).toBeVisible();
  expect(screen.getByRole("img", { name: /客観.*3票/ })).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "決定した課題" }));
  expect(body).not.toBeVisible();
  expect(body).toHaveAttribute("tabindex", "-1");
});
