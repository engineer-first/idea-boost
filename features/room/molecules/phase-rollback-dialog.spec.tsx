import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { PhaseRollbackDialog } from "./phase-rollback-dialog";

describe("PhaseRollbackDialog", () => {
  it("戻り先確認だけでは送信せず、最終確認で一度実行する", () => {
    const onConfirm = vi.fn();
    render(
      <PhaseRollbackDialog
        phase={buildPhaseStep(1, 2)}
        target={buildPhaseStep(5, 1)}
        disabled={false}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "直前のステップに戻る" }),
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "それ以降に全員が操作したものを取り消します",
    );
    fireEvent.click(screen.getByRole("button", { name: "1-5へ戻る" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/この操作は取り消せません/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "1-5へ戻る" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
  it("最終確認のキャンセルと無効時には実行しない", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <PhaseRollbackDialog
        phase={buildPhaseStep(1, 2)}
        target={buildPhaseStep(5, 1)}
        disabled={false}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "直前のステップに戻る" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "1-5へ戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(
      <PhaseRollbackDialog
        phase={buildPhaseStep(1, 2)}
        target={buildPhaseStep(5, 1)}
        disabled={true}
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.getByRole("button", { name: "直前のステップに戻る" }),
    ).toBeDisabled();
  });
});
