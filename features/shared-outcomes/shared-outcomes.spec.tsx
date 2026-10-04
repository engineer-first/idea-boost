import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgressHistoryRecord } from "@/contracts/progress-history.fixture";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";
import { SharedOutcomes } from "./shared-outcomes";
import { SharedOutcomesView } from "./shared-outcomes-view";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("共有成果閲覧", () => {
  it.each([
    "pending",
    "failed",
    "saved",
  ] as const)("確定記録の反映状態 %s に応じて表示盤面の時点を区別する", (saveStatus) => {
    render(
      <SharedOutcomesView
        loading={false}
        error={null}
        outcomes={[]}
        detail={buildSharedOutcome({ status: "confirmed", saveStatus })}
        nextCursor={null}
        onOpen={vi.fn()}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        onMore={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name:
          saveStatus === "saved"
            ? "完了時点の共有ボード"
            : "最後に正常保存した共有ボード",
      }),
    ).toBeInTheDocument();
    if (saveStatus !== "saved")
      expect(
        screen.queryByRole("heading", { name: "完了時点の共有ボード" }),
      ).not.toBeInTheDocument();
  });
  it("取得ごとに認可し、剥奪時に前の内容を隠す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ outcomes: [buildSharedOutcome()], nextCursor: null }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SharedOutcomes />);
    await screen.findByRole("link", { name: /相談ルーム/ });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shared-outcomes",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "最新の状態を取得" }));
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("link", { name: /相談ルーム/ }),
    ).not.toBeInTheDocument();
  });
  it("一覧から詳細へ進み戻る操作でも新しく取得する", async () => {
    const record = buildSharedOutcome();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ outcomes: [record], nextCursor: null }),
      )
      .mockResolvedValueOnce(Response.json(record))
      .mockResolvedValueOnce(Response.json({ entries: [], nextCursor: null }))
      .mockResolvedValueOnce(Response.json({ outcomes: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SharedOutcomes />);
    fireEvent.click(await screen.findByRole("link", { name: /相談ルーム/ }));
    await screen.findByRole("heading", { name: "決定した3項目" });
    fireEvent.click(screen.getByRole("button", { name: "成果一覧へ戻る" }));
    await screen.findByText("保存期間内の成果はありません。");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });
  it("決定内容・候補外・グループ・保存失敗と前回成功分を表示する", async () => {
    const record = buildSharedOutcome({ saveStatus: "failed" });
    render(
      <SharedOutcomesView
        loading={false}
        error={null}
        outcomes={[]}
        detail={record}
        nextCursor={null}
        onOpen={vi.fn()}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        onMore={vi.fn()}
      />,
    );
    expect(screen.getByText(/前回の正常保存分/)).toBeInTheDocument();
    expect(screen.getAllByText("待ち時間を減らす").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/受付の改善/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("tab", { name: "アイデア" }));
    expect(screen.getAllByText("候補外").length).toBeGreaterThan(0);
    expect(screen.getByText("未決定")).toBeInTheDocument();
  });
  it("loading中は更新を無効化し、保存なしを空の盤面と区別する", () => {
    const { rerender } = render(
      <SharedOutcomesView
        loading
        error={null}
        outcomes={[]}
        detail={null}
        nextCursor={null}
        onOpen={vi.fn()}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        onMore={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "最新の状態を取得" }),
    ).toBeDisabled();
    rerender(
      <SharedOutcomesView
        loading={false}
        error={null}
        outcomes={[]}
        detail={buildSharedOutcome({ snapshot: null, lastSavedAt: null })}
        nextCursor={null}
        onOpen={vi.fn()}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        onMore={vi.fn()}
      />,
    );
    expect(
      screen.getByText("正常保存された成果はまだありません。"),
    ).toBeInTheDocument();
  });
});

it("意見一覧からルーム指定で共有成果を直接開き、その進行記録も読める", async () => {
  const record = buildSharedOutcome();
  window.history.replaceState(
    null,
    "",
    `/shared-outcomes?roomId=${record.roomId}`,
  );
  const history = buildProgressHistoryRecord();
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith(`/history/${history.id}`)) return Response.json(history);
    if (url.endsWith("/history"))
      return Response.json({ entries: [history], nextCursor: null });
    return Response.json(record);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<SharedOutcomes />);
  await screen.findByRole("heading", { name: "決定した3項目" });
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/shared-outcomes/${record.roomId}`,
    expect.objectContaining({ cache: "no-store" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: /盤面を見る/ }));
  await screen.findByRole("heading", { name: /記録 1 ·/ });
  await screen.findAllByText("受付の案内を分かりやすくする");
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/shared-outcomes/${record.roomId}/history/${history.id}`,
    expect.objectContaining({ cache: "no-store" }),
  );
});
