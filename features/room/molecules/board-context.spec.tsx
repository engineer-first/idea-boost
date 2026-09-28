import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { BoardContext } from "./board-context";

describe("現在地と全手順", () => {
  it.each([
    1, 2, 3,
  ] as const)("フェーズ%iのゴールと折りたたみ手順を示す", (phase) => {
    render(
      <BoardContext
        phase={buildPhaseStep(2, phase)}
        hmwDecidedIssue={null}
        decidedHmw={null}
      />,
    );
    expect(screen.getByText(/ゴール：/)).toBeVisible();
    const button = screen.getByRole("button", { name: "全手順を見る" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("list", { name: "このフェーズの全手順" }),
    ).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(
      screen.getByRole("list", { name: "このフェーズの全手順" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "全手順を閉じる" }));
    expect(
      screen.queryByRole("list", { name: "このフェーズの全手順" }),
    ).not.toBeInTheDocument();
  });
});
