import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  PhaseLoopControls,
  type PhaseLoopControlsProps,
} from "./phase-loop-controls";

function setup(overrides: Partial<PhaseLoopControlsProps> = {}) {
  const props = {
    phase: buildPhaseStep(5),
    isHost: true,
    isSelecting: false,
    decisionContent: null,
    candidateCount: 2,
    disabled: false,
    onRestartWriting: vi.fn(),
    onRevote: vi.fn(),
    onStartSelection: vi.fn(),
    onCancelSelection: vi.fn(),
    ...overrides,
  };
  return { ...render(<PhaseLoopControls {...props} />), props };
}
describe("PhaseLoopControls", () => {
  it("再投票は確認したときだけ通知し、キャンセルでは票に触れない", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "もう一度投票する" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("候補2件");
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(props.onRevote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "もう一度投票する" }));
    fireEvent.click(
      screen.getByRole("button", { name: "前回の票を消して始める" }),
    );
    expect(props.onRevote).toHaveBeenCalledOnce();
  });
  it("候補0件では再投票と採用を止め、復帰を案内する", () => {
    setup({ candidateCount: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("候補に戻す");
    expect(
      screen.getByRole("button", { name: "もう一度投票する" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "採用する付箋を選ぶ" }),
    ).toBeDisabled();
  });
  it("参加者へ操作を出さず、候補0件の待機を案内する", () => {
    setup({ isHost: false, candidateCount: 0 });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("お待ちください");
  });
  it("採用後は取消も再投票も出さない", () => {
    setup({ decisionContent: "確定した課題" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("確定した課題")).toBeVisible();
  });
  it("共有の追加作業は確認で通知する", () => {
    const { props } = setup({ phase: buildPhaseStep(2) });
    fireEvent.click(screen.getByRole("button", { name: "もう一度付箋を書く" }));
    fireEvent.click(screen.getByRole("button", { name: "個人作業へ戻る" }));
    expect(props.onRestartWriting).toHaveBeenCalledOnce();
  });
});
