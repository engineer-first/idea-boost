import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { BoardContext } from "./board-context";

describe("現在地と補足情報", () => {
  it.each([1, 2, 3] as const)(
    "フェーズ%iの現在地を常に表示し、不要な案内を表示しない",
    (phase) => {
      const onOpenFeedback = vi.fn();
      render(
        <BoardContext
          phase={buildPhaseStep(2, phase)}
          hmwDecidedIssue={null}
          decidedHmw={null}
          onOpenFeedback={onOpenFeedback}
        />,
      );

      expect(screen.getByTestId("board-phase-progress")).toBeVisible();
      expect(screen.getByTestId("board-current-step")).toBeVisible();
      expect(screen.getByTestId("board-progress-rail")).toBeVisible();
      const feedbackButton = screen.getByRole("button", {
        name: "フィードバック",
      });
      expect(feedbackButton).toBeVisible();
      expect(feedbackButton).toHaveTextContent("フィードバック");
      expect(onOpenFeedback).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: "ゴールと進行" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "全手順を見る" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/ゴール：/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          /ホスト：進行はあなたが操作|参加者：次への進行はホストが操作/,
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("list", { name: "このフェーズの全手順" }),
      ).not.toBeInTheDocument();
      fireEvent.click(feedbackButton);
      expect(onOpenFeedback).toHaveBeenCalledOnce();
    },
  );

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
