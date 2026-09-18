import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkCandidateExclusion } from "./bulk-candidate-exclusion";

describe("BulkCandidateExclusion", () => {
  it("対象件数を表示し、確認後に一括除外する", () => {
    const onConfirm = vi.fn();
    render(
      <BulkCandidateExclusion
        targetCount={3}
        disabled={false}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "投票なしをまとめて候補から外す（3件）",
      }),
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "投票のない候補3件をまとめて外しますか？",
    );
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "3件を候補から外す" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("対象0件では理由を説明して操作を無効にする", () => {
    render(
      <BulkCandidateExclusion
        targetCount={0}
        disabled={false}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText("投票のない共有済み候補はありません"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "投票なしをまとめて候補から外す",
      }),
    ).toBeDisabled();
  });
});
