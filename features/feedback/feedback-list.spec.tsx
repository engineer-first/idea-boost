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
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
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
it.each([
  ["送信日時（開始）", "from", "送信日時（終了）", "to"],
  ["送信日時（終了）", "to", "送信日時（開始）", "from"],
])(
  "%sが変換不能でも有効な日時・種類・対象の絞り込みを送る",
  async (invalidLabel, invalidKey, validLabel, validKey) => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get("/api/feedback", ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          canReadOutcomes: false,
        });
      }),
    );
    render(<FeedbackList />);
    await screen.findByText("条件に合う意見はありません。");
    fireEvent.change(screen.getByLabelText("種類で絞る"), {
      target: { value: "good" },
    });
    fireEvent.change(screen.getByLabelText("対象で絞る"), {
      target: { value: "app" },
    });
    const valid = "2026-09-29T12:30";
    fireEvent.change(screen.getByLabelText(validLabel), {
      target: { value: valid },
    });
    await waitFor(() =>
      expect(queries.at(-1)?.get(validKey)).toBe(
        String(new Date(valid).getTime()),
      ),
    );
    const before = queries.length;
    // datetime-local は4桁を超える年を受け付けるが、Dateの範囲は有限。
    fireEvent.change(screen.getByLabelText(invalidLabel), {
      target: { value: "300000-01-01T00:00" },
    });
    expect(screen.getByLabelText(invalidLabel)).toHaveValue(
      "300000-01-01T00:00",
    );
    await waitFor(() => expect(queries.length).toBeGreaterThan(before));
    expect(Object.fromEntries(queries.at(-1) ?? [])).toEqual({
      kind: "good",
      target: "app",
      [validKey]: String(new Date(valid).getTime()),
    });
    expect(queries.at(-1)?.has(invalidKey)).toBe(false);
    fireEvent.change(screen.getByLabelText(invalidLabel), {
      target: { value: valid },
    });
    await waitFor(() =>
      expect(queries.at(-1)?.get(invalidKey)).toBe(
        String(new Date(valid).getTime()),
      ),
    );
    fireEvent.change(screen.getByLabelText(invalidLabel), {
      target: { value: "" },
    });
    await waitFor(() => expect(queries.at(-1)?.has(invalidKey)).toBe(false));
    expect(queries.at(-1)?.get(validKey)).toBe(
      String(new Date(valid).getTime()),
    );
  },
);
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

it.each(["503", "network"])(
  "続きの%s取得失敗では既読一覧を残し、再試行は同じ取得位置から重複なく追加する",
  async (failure) => {
    const cursors: Array<string | null> = [];
    let failed = true;
    server.use(
      http.get("/api/feedback", ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        cursors.push(cursor);
        if (cursor && failed)
          return failure === "network"
            ? HttpResponse.error()
            : HttpResponse.json({}, { status: 503 });
        return HttpResponse.json({
          items: cursor
            ? [
                record,
                {
                  ...record,
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  body: "続きの意見",
                },
              ]
            : [record],
          nextCursor: cursor ? null : "next",
          canReadOutcomes: true,
        });
      }),
    );
    render(<FeedbackList />);
    await screen.findByText(record.body);
    fireEvent.click(screen.getByRole("button", { name: "さらに表示" }));
    await screen.findByText("意見を取得できませんでした。再試行してください。");
    expect(screen.getByText(record.body)).toBeInTheDocument();
    expect(
      screen.queryByText("条件に合う意見はありません。"),
    ).not.toBeInTheDocument();
    const beforeRetry = cursors.length;
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    await screen.findByText("続きの意見");
    expect(cursors.length).toBeGreaterThan(beforeRetry);
    expect(
      cursors.slice(beforeRetry).every((cursor) => cursor === "next"),
    ).toBe(true);
    expect(screen.getAllByText(record.body)).toHaveLength(1);
  },
);

it.each([401, 403])(
  "続きの取得が%dで拒否された場合は既読本文と成果リンクも消す",
  async (status) => {
    server.use(
      http.get("/api/feedback", ({ request }) =>
        new URL(request.url).searchParams.has("cursor")
          ? HttpResponse.json({}, { status })
          : HttpResponse.json({
              items: [record],
              nextCursor: "next",
              canReadOutcomes: true,
            }),
      ),
    );
    render(<FeedbackList />);
    await screen.findByText(record.body);
    fireEvent.click(screen.getByRole("button", { name: "さらに表示" }));
    await screen.findByText(
      status === 401
        ? "ログインしてください。"
        : "意見の閲覧権限がありません。",
    );
    expect(screen.queryByText(record.body)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "共有成果を見る" }),
    ).not.toBeInTheDocument();
  },
);

it("「わからない」の投稿を表示し、同じ種類で絞り込める", async () => {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get("/api/feedback", ({ request }) => {
      queries.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        items: [
          {
            ...record,
            kind: "unclear",
            target: "1-3",
            body: "何を基準に投票するかわからない",
            rating: null,
          },
        ],
        nextCursor: null,
        canReadOutcomes: false,
      });
    }),
  );
  render(<FeedbackList />);
  await screen.findByText("何を基準に投票するかわからない");
  expect(
    screen.getByText("わからない", { selector: "span" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("種類で絞る"), {
    target: { value: "unclear" },
  });
  await waitFor(() => expect(queries.at(-1)?.get("kind")).toBe("unclear"));
});
