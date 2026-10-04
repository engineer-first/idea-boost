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

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
const first = buildSharedOutcome();
const second = buildSharedOutcome({
  roomId: "123e4567-e89b-42d3-a456-426614174001",
  name: "追加の成果",
});
function setup() {
  window.history.replaceState(null, "", "/shared-outcomes");
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/history"))
      return Response.json({ entries: [], nextCursor: null });
    if (url.includes(first.roomId)) return Response.json(first);
    if (url.includes("cursor=50"))
      return Response.json({ outcomes: [second], nextCursor: null });
    return Response.json({ outcomes: [first], nextCursor: "50" });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<SharedOutcomes />);
  return fetchMock;
}
it("追加取得中と失敗後も一覧を保ち、同じ続きを再試行できる", async () => {
  const fetchMock = setup();
  await screen.findByRole("link", { name: /相談ルーム/ });
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "次の成果を表示" }));
  expect(screen.getByRole("link", { name: /相談ルーム/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /取得中/ })).toBeDisabled();
  await act(async () => resolve(new Response(null, { status: 500 })));
  await screen.findByRole("alert");
  expect(screen.getByRole("link", { name: /相談ルーム/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "再試行" }));
  await screen.findByRole("link", { name: /追加の成果/ });
});
it("詳細を履歴に追加し、ブラウザの戻るで追加済みの一覧を再取得して復元する", async () => {
  const fetchMock = setup();
  await screen.findByRole("link", { name: /相談ルーム/ });
  fireEvent.click(screen.getByRole("button", { name: "次の成果を表示" }));
  await screen.findByRole("link", { name: /追加の成果/ });
  fireEvent.click(screen.getByRole("link", { name: /相談ルーム/ }));
  await screen.findByRole("heading", { name: "決定した3項目" });
  expect(new URL(window.location.href).searchParams.get("roomId")).toBe(
    first.roomId,
  );
  act(() => {
    window.history.replaceState(null, "", "/shared-outcomes");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await screen.findByRole("link", { name: /追加の成果/ });
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([url]) => url.includes("cursor=50")),
    ).toHaveLength(2),
  );
});
it("URLの検索条件を復元し、条件変更時に取得位置をリセットする", async () => {
  window.history.replaceState(
    null,
    "",
    "/shared-outcomes?q=受付&status=confirmed&phase=3",
  );
  const fetchMock = vi.fn(async (_url: string) =>
    Response.json({ outcomes: [first], nextCursor: null }),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<SharedOutcomes />);
  await screen.findByRole("link", { name: /相談ルーム/ });
  expect(
    screen.getByRole("searchbox", { name: "ルーム名・ルームID" }),
  ).toHaveValue("受付");
  fireEvent.change(
    screen.getByRole("searchbox", { name: "ルーム名・ルームID" }),
    { target: { value: "別ルーム" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "検索" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const params = new URL(
    fetchMock.mock.calls.at(-1)?.[0] ?? "",
    "https://api.test",
  ).searchParams;
  expect(params.get("q")).toBe("別ルーム");
  expect(params.get("cursor")).toBeNull();
});

it("一覧へ戻る再取得で権限を失った場合は、追加済みの成果も隠す", async () => {
  const fetchMock = setup();
  fireEvent.click(await screen.findByRole("link", { name: /相談ルーム/ }));
  await screen.findByRole("heading", { name: "決定した3項目" });
  fetchMock.mockImplementationOnce(
    async () => new Response(null, { status: 403 }),
  );
  act(() => {
    window.history.replaceState(null, "", "/shared-outcomes");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("link", { name: /相談ルーム/ }),
  ).not.toBeInTheDocument();
});
it("前の検索の遅い応答で新しい条件の結果を上書きしない", async () => {
  const fetchMock = setup();
  await screen.findByRole("link", { name: /相談ルーム/ });
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "古い条件" },
  });
  fireEvent.click(screen.getByRole("button", { name: "検索" }));
  fetchMock.mockImplementationOnce(async () =>
    Response.json({ outcomes: [second], nextCursor: null }),
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "新しい条件" },
  });
  fireEvent.click(screen.getByRole("button", { name: "検索" }));
  await screen.findByRole("link", { name: /追加の成果/ });
  await act(async () =>
    resolve(Response.json({ outcomes: [first], nextCursor: null })),
  );
  expect(
    screen.queryByRole("link", { name: /相談ルーム/ }),
  ).not.toBeInTheDocument();
});

it("絞り込み後も選択欄のフォーカスを保ち、キーボードで続けて操作できる", async () => {
  setup();
  await screen.findByRole("link", { name: /相談ルーム/ });
  const select = screen.getByLabelText("保存状態");
  select.focus();
  fireEvent.change(select, { target: { value: "failed" } });
  await waitFor(() =>
    expect(new URL(window.location.href).searchParams.get("saveStatus")).toBe(
      "failed",
    ),
  );
  expect(screen.getByLabelText("保存状態")).toHaveFocus();
});

it("追加取得時の認可拒否でも成果を隠し、権限エラーを表示する", async () => {
  const fetchMock = setup();
  await screen.findByRole("link", { name: /相談ルーム/ });
  fetchMock.mockImplementationOnce(
    async () => new Response(null, { status: 403 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "次の成果を表示" }));
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("link", { name: /相談ルーム/ }),
  ).not.toBeInTheDocument();
});
