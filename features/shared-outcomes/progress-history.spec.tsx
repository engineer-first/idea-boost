import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";
import { SharedOutcomes } from "./shared-outcomes";

afterEach(() => vi.unstubAllGlobals());
const outcome = buildSharedOutcome();
const snapshot = outcome.snapshot;
if (!snapshot) throw new Error("fixture snapshot required");
const entries = [1, 2].map((sequence) => ({
  id: `123e4567-e89b-42d3-a456-42661417400${sequence}`,
  sequence,
  phase: { kind: "step", phase: 1, step: sequence },
  nextPhase: { kind: "step", phase: 1, step: sequence + 1 },
  action: "next",
  enteredAt: 1000,
  exitedAt: 61000,
  saveStatus: "saved",
  reflectedAt: 62000,
}));
it("時系列を分割取得し、選択した盤面だけ取得して遅れた応答を無視する", async () => {
  let resolveFirst!: (value: Response) => void;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith(`/history/${entries[0].id}`))
      return new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      });
    if (url.endsWith(`/history/${entries[1].id}`))
      return Response.json({
        ...entries[1],
        snapshot: {
          ...outcome.snapshot,
          notes: [{ ...snapshot.notes[0], content: "新しく選んだ記録" }],
        },
      });
    if (url.endsWith("/history?cursor=1"))
      return Response.json({ entries: [entries[1]], nextCursor: null });
    if (url.endsWith("/history"))
      return Response.json({ entries: [entries[0]], nextCursor: "1" });
    if (url.endsWith(outcome.roomId)) return Response.json(outcome);
    return Response.json({ outcomes: [outcome], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<SharedOutcomes />);
  fireEvent.click(await screen.findByRole("button", { name: /相談ルーム/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: "次の記録を表示" }),
  );
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: /盤面を見る/ })).toHaveLength(
      2,
    ),
  );
  fireEvent.click(screen.getAllByRole("button", { name: /盤面を見る/ })[0]);
  await screen.findByText("盤面を読み込んでいます…");
  expect(screen.getByRole("heading", { name: /記録 1 ·/ })).toHaveFocus();
  fireEvent.click(screen.getAllByRole("button", { name: /盤面を見る/ })[1]);
  await screen.findAllByText("新しく選んだ記録");
  await act(async () =>
    resolveFirst(Response.json({ ...entries[0], snapshot: outcome.snapshot })),
  );
  expect(screen.getAllByText("新しく選んだ記録").length).toBeGreaterThan(0);
  expect(
    fetchMock.mock.calls.filter(([url]) => url.includes("/history/")).length,
  ).toBe(2);
});

it("盤面の取得失敗で古い本文を表示せず、同じ記録を再取得できる", async () => {
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/history/")) {
        if (failed) return new Response(null, { status: 503 });
        return Response.json({ ...entries[0], snapshot: outcome.snapshot });
      }
      if (url.endsWith("/history"))
        return Response.json({ entries: [entries[0]], nextCursor: null });
      if (url.endsWith(outcome.roomId)) return Response.json(outcome);
      return Response.json({ outcomes: [outcome], nextCursor: null });
    }),
  );
  render(<SharedOutcomes />);
  fireEvent.click(await screen.findByRole("button", { name: /相談ルーム/ }));
  fireEvent.click(await screen.findByRole("button", { name: /盤面を見る/ }));
  await screen.findByText(/盤面を取得できませんでした/);
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "盤面を再取得" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "盤面を再取得" }),
    ).not.toBeInTheDocument(),
  );
});
it.each([
  401, 403,
])("履歴取得の認可拒否 %s で既存の詳細も隠す", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/history")) return new Response(null, { status });
      if (url.endsWith(outcome.roomId)) return Response.json(outcome);
      return Response.json({ outcomes: [outcome], nextCursor: null });
    }),
  );
  render(<SharedOutcomes />);
  fireEvent.click(await screen.findByRole("button", { name: /相談ルーム/ }));
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("heading", { name: "決定した3項目" }),
  ).not.toBeInTheDocument();
});

it("旧ルームの盤面取得中に別ルームへ移っても更新操作が有効になる", async () => {
  const other = buildSharedOutcome({
    roomId: "123e4567-e89b-42d3-a456-426614174099",
    name: "別ルーム",
  });
  let release!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/history/"))
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      if (url.endsWith("/history"))
        return Response.json({ entries: [entries[0]], nextCursor: null });
      if (url.endsWith(outcome.roomId)) return Response.json(outcome);
      if (url.endsWith(other.roomId)) return Response.json(other);
      return Response.json({ outcomes: [outcome, other], nextCursor: null });
    }),
  );
  render(<SharedOutcomes />);
  fireEvent.click(await screen.findByRole("button", { name: /相談ルーム/ }));
  fireEvent.click(await screen.findByRole("button", { name: /盤面を見る/ }));
  await screen.findByText("盤面を読み込んでいます…");
  fireEvent.click(screen.getByRole("button", { name: "成果一覧へ戻る" }));
  fireEvent.click(await screen.findByRole("button", { name: /別ルーム/ }));
  await screen.findByRole("button", { name: /盤面を見る/ });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "記録の最新状態を取得" }),
    ).toBeEnabled(),
  );
  await act(async () =>
    release(Response.json({ ...entries[0], snapshot: outcome.snapshot })),
  );
  expect(
    screen.queryByRole("region", { name: "選択した記録" }),
  ).not.toBeInTheDocument();
});

it("履歴へ進み、全文を読んだ後に記録一覧へ戻って別の記録を選べる", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const entry = entries.find((item) => url.endsWith(`/history/${item.id}`));
      if (entry) return Response.json({ ...entry, snapshot: outcome.snapshot });
      if (url.endsWith("/history"))
        return Response.json({ entries, nextCursor: null });
      if (url.endsWith(outcome.roomId)) return Response.json(outcome);
      return Response.json({ outcomes: [outcome], nextCursor: null });
    }),
  );
  render(<SharedOutcomes />);
  fireEvent.click(await screen.findByRole("button", { name: /相談ルーム/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: "進行の記録を見る" }),
  );
  expect(screen.getByRole("heading", { name: "進行の記録" })).toHaveFocus();
  fireEvent.click(
    await screen.findByRole("button", { name: "記録 1 の盤面を見る" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByText("盤面を読み込んでいます…"),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "記録一覧へ戻る" }));
  expect(screen.getByRole("heading", { name: "進行の記録" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "記録 2 の盤面を見る" }));
  expect(
    await screen.findByRole("heading", { name: /記録 2 ·/ }),
  ).toHaveFocus();
});
