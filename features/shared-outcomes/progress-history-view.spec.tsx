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
  ["pending", "この盤面はまだ表示できません。"],
  ["failed", "保存に失敗しました。"],
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

it("保存済み・反映待ちの記録には保存の状態を出さず、失敗だけを「保存失敗」で示す", () => {
  const saved = buildProgressHistoryRecord({
    id: "123e4567-e89b-42d3-a456-426614174021",
    sequence: 1,
  });
  const pending = buildProgressHistoryRecord({
    id: "123e4567-e89b-42d3-a456-426614174022",
    sequence: 2,
    saveStatus: "pending",
  });
  const failed = buildProgressHistoryRecord({
    id: "123e4567-e89b-42d3-a456-426614174023",
    sequence: 3,
    saveStatus: "failed",
  });
  render(
    <ProgressHistoryView
      {...handlers}
      entries={[saved, pending, failed]}
      selected={saved}
      record={saved}
      nextCursor={null}
      loading={false}
      error={null}
      recordLoading={false}
      recordError={null}
    />,
  );
  const items = screen.getAllByRole("listitem");
  expect(items[0]).not.toHaveTextContent(/保存済み|反映/);
  expect(items[1]).not.toHaveTextContent(/保存済み|反映/);
  expect(items[2]).toHaveTextContent("保存失敗");
  expect(
    screen.queryByText(/閲覧への反映|保存済み|反映待ち/),
  ).not.toBeInTheDocument();
});
