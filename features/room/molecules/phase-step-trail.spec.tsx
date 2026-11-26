import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { PhaseStepTrail } from "./phase-step-trail";

describe("PhaseStepTrail", () => {
  it("今のステップを押すと、そのステップの進め方を開く", () => {
    const onOpenGuide = vi.fn();
    render(
      <PhaseStepTrail phase={buildPhaseStep(1, 2)} onOpenGuide={onOpenGuide} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "「個人」の進め方を開く" }),
    );

    expect(onOpenGuide).toHaveBeenCalledTimes(1);
  });

  it("進め方を開けないときは、今のステップを押せる部品にしない", () => {
    render(<PhaseStepTrail phase={buildPhaseStep(1, 2)} />);

    expect(
      screen.queryByRole("button", { name: "「個人」の進め方を開く" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "②問いのステップ" })).getByText(
        "個人",
      ),
    ).toBeVisible();
  });

  it("終わったステップと先のステップは押せない", () => {
    render(
      <PhaseStepTrail phase={buildPhaseStep(2, 2)} onOpenGuide={vi.fn()} />,
    );

    const steps = screen.getByRole("list", { name: "②問いのステップ" });
    expect(within(steps).getAllByRole("button")).toHaveLength(1);
  });

  it("フェーズ名を押すと全体の流れを開き、今のステップを示す", () => {
    render(
      <PhaseStepTrail phase={buildPhaseStep(3, 2)} onOpenGuide={vi.fn()} />,
    );

    const phaseButton = screen.getByRole("button", {
      name: "②問い：全体の流れを開く",
    });
    expect(phaseButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(phaseButton);

    const flow = screen.getByRole("region", { name: "全体の流れと手順" });
    expect(
      within(flow).getByRole("tab", { name: "② 問いの手順", selected: true }),
    ).toBeVisible();
    expect(within(flow).getByTestId("board-current-step")).toHaveTextContent(
      "投票",
    );
    expect(phaseButton).toHaveAttribute("aria-expanded", "true");
  });

  it("全体の流れを開いたままステップが進むと閉じる", () => {
    const { rerender } = render(
      <PhaseStepTrail phase={buildPhaseStep(5, 1)} onOpenGuide={vi.fn()} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "①課題：全体の流れを開く" }),
    );
    expect(
      screen.getByRole("region", { name: "全体の流れと手順" }),
    ).toBeVisible();

    rerender(
      <PhaseStepTrail phase={buildPhaseStep(1, 2)} onOpenGuide={vi.fn()} />,
    );

    expect(
      screen.queryByRole("region", { name: "全体の流れと手順" }),
    ).not.toBeInTheDocument();
  });

  it("全体の流れを開いたまま進んだ後に元のステップへ戻っても、閉じたまま", () => {
    const { rerender } = render(
      <PhaseStepTrail phase={buildPhaseStep(4, 1)} onOpenGuide={vi.fn()} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "①課題：全体の流れを開く" }),
    );
    rerender(
      <PhaseStepTrail phase={buildPhaseStep(5, 1)} onOpenGuide={vi.fn()} />,
    );
    rerender(
      <PhaseStepTrail phase={buildPhaseStep(4, 1)} onOpenGuide={vi.fn()} />,
    );

    expect(
      screen.queryByRole("region", { name: "全体の流れと手順" }),
    ).not.toBeInTheDocument();
  });
});
