import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { buildProgressHistoryRecord } from "@/contracts/progress-history.fixture";
import { ProgressHistoryView } from "./progress-history-view";

const handlers = {
  onOpen: vi.fn(),
  onMore: vi.fn(),
  onRefresh: vi.fn(),
  onRetry: vi.fn(),
};
it.each([
  ["pending", "閲覧への反映を待っています。"],
  ["failed", "保全した同じ記録を自動で再試行しています。"],
  ["missing", "盤面を保存できませんでした。"],
] as const)(
  "%s の記録を別時点の盤面で補わず説明する",
  (saveStatus, message) => {
    const record = buildProgressHistoryRecord({
      saveStatus,
      snapshot: null,
      reflectedAt: null,
    });
    render(
      <ProgressHistoryView
        {...handlers}
        entries={[record]}
        selected={record}
        record={record}
        nextCursor={null}
        loading={false}
        error={null}
        recordLoading={false}
        recordError={null}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  },
);
it("正常な空盤面と不明な時刻を表示し、アイデアの記録はそのタブを開く", () => {
  const base = buildProgressHistoryRecord();
  if (!base.snapshot) throw new Error("fixture snapshot required");
  const record = buildProgressHistoryRecord({
    phase: { kind: "step", phase: 3, step: 3 },
    enteredAt: null,
    snapshot: { ...base.snapshot, notes: [] },
  });
  render(
    <ProgressHistoryView
      {...handlers}
      entries={[record]}
      selected={record}
      record={record}
      nextCursor={null}
      loading={false}
      error={null}
      recordLoading={false}
      recordError={null}
    />,
  );
  expect(screen.getByText("開始時刻不明")).toBeInTheDocument();
  expect(screen.getByText("—")).toBeInTheDocument();
  expect(
    screen.getByText("正常に保存された空の盤面です。"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "選択した記録" })).getByRole(
      "tab",
      { name: "アイデア" },
    ),
  ).toHaveAttribute("aria-selected", "true");
});
