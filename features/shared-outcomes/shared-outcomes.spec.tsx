import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgressHistoryRecord } from "@/contracts/progress-history.fixture";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";
import { SharedOutcomes } from "./shared-outcomes";
import { DEFAULT_OUTCOME_FILTERS } from "./shared-outcomes-query";
import { SharedOutcomesView } from "./shared-outcomes-view";

const viewProps = {
  loading: false,
  error: null,
  nextCursor: null,
  onOpen: vi.fn(),
  onBack: vi.fn(),
  onRefresh: vi.fn(),
  onMore: vi.fn(),
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
describe("共有成果閲覧", () => {
  it.each(["pending", "failed", "saved"] as const)(
    "確定記録の反映状態 %s に応じて表示盤面の時点を区別する",
    (saveStatus) => {
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
    },
  );
  it("反映待ちの成果は一覧でも詳細でも反映待ちの状態と説明を出さない", () => {
    const pending = buildSharedOutcome({ saveStatus: "pending" });
    const { rerender } = render(
      <SharedOutcomesView {...viewProps} outcomes={[pending]} detail={null} />,
    );
    const row = screen.getByRole("link", { name: /相談ルーム/ });
    expect(row).not.toHaveTextContent(/反映待ち|再試行|正常保存分/);

    rerender(
      <SharedOutcomesView {...viewProps} outcomes={[]} detail={pending} />,
    );
    expect(screen.queryByText(/反映待ち|反映を待って/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("保存できている成果は一覧でも詳細でも保存の状態を出さない", () => {
    const saved = buildSharedOutcome({ saveStatus: "saved" });
    const { rerender } = render(
      <SharedOutcomesView {...viewProps} outcomes={[saved]} detail={null} />,
    );
    expect(
      screen.getByRole("link", { name: /相談ルーム/ }),
    ).not.toHaveTextContent("保存済み");
    rerender(
      <SharedOutcomesView {...viewProps} outcomes={[]} detail={saved} />,
    );
    expect(screen.queryByText(/保存済み/)).not.toBeInTheDocument();
  });
  it("絞り込みに保存状態の欄を出さない", () => {
    render(
      <SharedOutcomesView
        {...viewProps}
        outcomes={[buildSharedOutcome()]}
        detail={null}
        filters={DEFAULT_OUTCOME_FILTERS}
        onSearch={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("記録")).toBeInTheDocument();
    expect(screen.queryByLabelText("保存状態")).not.toBeInTheDocument();
  });
  it("保存失敗は一覧と詳細で失敗だけを短く伝え、再試行の仕組みは説明しない", () => {
    const failed = buildSharedOutcome({ saveStatus: "failed" });
    const { rerender } = render(
      <SharedOutcomesView {...viewProps} outcomes={[failed]} detail={null} />,
    );
    const row = screen.getByRole("link", { name: /相談ルーム/ });
    expect(row).toHaveTextContent("保存失敗");
    expect(row).not.toHaveTextContent(/再試行|正常保存分/);

    rerender(
      <SharedOutcomesView {...viewProps} outcomes={[]} detail={failed} />,
    );
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "保存に失敗しました。表示している内容は前回の正常保存分です。",
    );
    expect(notice).not.toHaveTextContent("再試行");

    rerender(
      <SharedOutcomesView
        {...viewProps}
        outcomes={[]}
        detail={buildSharedOutcome({
          saveStatus: "failed",
          snapshot: null,
          lastSavedAt: null,
        })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /^保存に失敗しました。$/,
    );
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

it("一覧と詳細で各成果の参加人数を示し、未記録を0人と区別する", () => {
  const props = {
    loading: false,
    error: null,
    nextCursor: null,
    onOpen: vi.fn(),
    onBack: vi.fn(),
    onRefresh: vi.fn(),
    onMore: vi.fn(),
  };
  const record = { ...buildSharedOutcome(), participantCount: 3 };
  const unknown = {
    ...buildSharedOutcome({
      roomId: "123e4567-e89b-42d3-a456-426614174001",
      name: "旧ルーム",
    }),
    participantCount: null,
  };
  const { rerender } = render(
    <SharedOutcomesView
      {...props}
      outcomes={[record, unknown]}
      detail={null}
    />,
  );
  expect(screen.getByRole("link", { name: /相談ルーム/ })).toHaveTextContent(
    "参加人数：3人",
  );
  expect(screen.getByRole("link", { name: /旧ルーム/ })).toHaveTextContent(
    "参加人数：未記録",
  );
  rerender(<SharedOutcomesView {...props} outcomes={[]} detail={record} />);
  expect(screen.getByText("3人")).toBeInTheDocument();
  rerender(<SharedOutcomesView {...props} outcomes={[]} detail={unknown} />);
  expect(screen.getByText("未記録")).toBeInTheDocument();
});
