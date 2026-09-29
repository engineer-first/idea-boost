import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { FeedbackList } from "./feedback-list";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const record = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  target: "app",
  kind: "good",
  body: "役立ちました",
  rating: 5,
  createdAt: Date.now(),
  expiresAt: Date.now() + 100000,
};
it("種類・対象を送信して絞り込み、追加取得し、権限取り消し後は本文を隠す", async () => {
  const urls: string[] = [];
  let forbidden = false;
  server.use(
    http.get("/api/feedback", ({ request }) => {
      urls.push(request.url);
      if (forbidden)
        return HttpResponse.json({ error: "権限なし" }, { status: 403 });
      const q = new URL(request.url).searchParams;
      return HttpResponse.json({
        items: [
          q.has("cursor")
            ? {
                ...record,
                id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                body: "",
                rating: null,
              }
            : record,
        ],
        nextCursor: q.has("cursor") ? null : "next",
        canReadOutcomes: false,
      });
    }),
  );
  render(<FeedbackList />);
  await screen.findByText("役立ちました");
  expect(screen.getByText("5 / 5")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("種類で絞る"), {
    target: { value: "good" },
  });
  fireEvent.change(screen.getByLabelText("対象で絞る"), {
    target: { value: "app" },
  });
  await waitFor(() => expect(urls.at(-1)).toContain("target=app"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "さらに表示" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "さらに表示" }));
  await screen.findByText("文章なし（種類のみ）");
  expect(screen.getByText("未回答")).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "共有成果を見る" }),
  ).not.toBeInTheDocument();
  forbidden = true;
  fireEvent.click(screen.getByRole("button", { name: "更新" }));
  await screen.findByRole("alert");
  expect(screen.queryByText("役立ちました")).not.toBeInTheDocument();
});
it("取得失敗は空一覧と区別して再試行できる", async () => {
  let failed = true;
  server.use(
    http.get("/api/feedback", () =>
      failed
        ? HttpResponse.json({}, { status: 503 })
        : HttpResponse.json({
            items: [],
            nextCursor: null,
            canReadOutcomes: false,
          }),
    ),
  );
  render(<FeedbackList />);
  await screen.findByRole("alert");
  expect(
    screen.queryByText("条件に合う意見はありません。"),
  ).not.toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "再試行" }));
  await screen.findByText("条件に合う意見はありません。");
});

it("古い絞り込みの遅い応答で最新一覧を上書きしない", async () => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get("/api/feedback", async ({ request }) => {
      const filtered = new URL(request.url).searchParams.has("kind");
      if (!filtered) await delayed;
      return HttpResponse.json({
        items: [{ ...record, body: filtered ? "新しい条件" : "古い条件" }],
        nextCursor: null,
        canReadOutcomes: false,
      });
    }),
  );
  render(<FeedbackList />);
  fireEvent.change(screen.getByLabelText("種類で絞る"), {
    target: { value: "good" },
  });
  await screen.findByText("新しい条件");
  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(screen.getByText("新しい条件")).toBeInTheDocument();
  expect(screen.queryByText("古い条件")).not.toBeInTheDocument();
});
it("開いている一覧でも期限を迎えた本文を消す", async () => {
  server.use(
    http.get("/api/feedback", () =>
      HttpResponse.json({
        items: [{ ...record, expiresAt: Date.now() + 300 }],
        nextCursor: null,
        canReadOutcomes: true,
      }),
    ),
  );
  render(<FeedbackList />);
  await screen.findByText(record.body);
  expect(
    screen.getByRole("link", { name: "共有成果を見る" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByText(record.body)).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("link", { name: "共有成果を見る" }),
  ).not.toBeInTheDocument();
});
