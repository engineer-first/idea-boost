import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdoptNoteControl } from "./adopt-note-control";

describe("AdoptNoteControl", () => {
  it("未決定のホストに画面下からの明示的な入口を示す", () => {
    const onStartSelection = vi.fn();
    render(
      <AdoptNoteControl
        phaseNumber={1}
        isHost
        isSelecting={false}
        decisionContent={null}
        disabled={false}
        onStartSelection={onStartSelection}
        onCancelSelection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "採用する付箋を選ぶ" }));
    expect(onStartSelection).toHaveBeenCalledTimes(1);
  });

  it("選択中は対象クリックと Escape を案内し、キャンセルで終了する", () => {
    const onCancelSelection = vi.fn();
    render(
      <AdoptNoteControl
        phaseNumber={2}
        isHost
        isSelecting
        decisionContent={null}
        disabled={false}
        onStartSelection={vi.fn()}
        onCancelSelection={onCancelSelection}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "採用する問いをクリックしてください",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Escape");
    fireEvent.click(screen.getByRole("button", { name: "選択をキャンセル" }));
    expect(onCancelSelection).toHaveBeenCalledTimes(1);
  });

  it("ホストだけ確定を取り消せ、切断中は無効で参加者には出さない", () => {
    const onClearDecision = vi.fn();
    const { rerender } = render(
      <AdoptNoteControl
        phaseNumber={3}
        isHost
        isSelecting={false}
        onClearDecision={onClearDecision}
        decisionContent="採用するアイデア"
        disabled={false}
        onStartSelection={vi.fn()}
        onCancelSelection={vi.fn()}
      />,
    );

    expect(screen.getByText("採用するアイデア")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "確定を取り消す" }));
    expect(onClearDecision).toHaveBeenCalledOnce();
    rerender(
      <AdoptNoteControl
        phaseNumber={3}
        isHost
        isSelecting={false}
        decisionContent="採用するアイデア"
        disabled
        onStartSelection={vi.fn()}
        onCancelSelection={vi.fn()}
        onClearDecision={onClearDecision}
      />,
    );
    expect(
      screen.getByRole("button", { name: "確定を取り消す" }),
    ).toBeDisabled();

    rerender(
      <AdoptNoteControl
        phaseNumber={3}
        isHost={false}
        isSelecting={false}
        onClearDecision={onClearDecision}
        decisionContent="採用するアイデア"
        disabled={false}
        onStartSelection={vi.fn()}
        onCancelSelection={vi.fn()}
      />,
    );
    expect(screen.getByText("採用するアイデア")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "確定を取り消す" }),
    ).not.toBeInTheDocument();
  });
});
