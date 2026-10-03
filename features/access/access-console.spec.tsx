import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccessConsole } from "./access-console";
import { AccessManagement } from "./access-management";

afterEach(() => vi.unstubAllGlobals());

it("登録済みユーザーの付与・剥奪が一覧へ反映される", async () => {
  let users: Array<{ id: string; name: string; email: string }> = [];
  const fetcher = vi.fn(
    async (_path: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET")
        return Response.json({ users });
      const { email } = JSON.parse(String(init.body)) as { email: string };
      if (init.method === "POST") users = [{ id: "1", name: "Reader", email }];
      else users = [];
      return Response.json({ ok: true });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  render(<AccessConsole />);
  await screen.findByText("閲覧者はいません。");
  fireEvent.change(screen.getByRole("textbox", { name: "メールアドレス" }), {
    target: { value: "reader@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "追加" }));
  await screen.findByText("Reader");
  expect(screen.getByText("reader@example.test")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", {
      name: "reader@example.test の閲覧権限を取り消す",
    }),
  );
  await screen.findByText("閲覧者はいません。");
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(1);
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(1);
});

it("未登録メールの案内を表示して再入力できる", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json(
            {
              error:
                "このユーザーはまだ Idea Boost に登録されていません。先に Google ログインしてください。",
            },
            { status: 404 },
          )
        : Response.json({ users: [] }),
    ),
  );
  render(<AccessConsole />);
  await screen.findByText("閲覧者はいません。");
  fireEvent.change(screen.getByRole("textbox", { name: "メールアドレス" }), {
    target: { value: "missing@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "追加" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "先に Google ログインしてください",
    ),
  );
  expect(screen.getByRole("textbox", { name: "メールアドレス" })).toHaveValue(
    "missing@example.test",
  );
});

it("一覧取得失敗を空一覧と混同せず、再試行で取得し直す", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "unavailable" }, { status: 503 }),
    )
    .mockResolvedValueOnce(Response.json({ users: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<AccessConsole />);
  await screen.findByRole("alert");
  expect(screen.queryByText("閲覧者はいません。")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "再試行" }));
  await screen.findByText("閲覧者はいません。");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each(["POST", "DELETE"] as const)(
  "%sの通信失敗は同じ操作を再試行し、処理中の二重操作を防ぐ",
  async (method) => {
    const reader = { id: "1", name: "Reader", email: "reader@example.test" };
    let attempts = 0;
    let users = method === "POST" ? [] : [reader];
    let complete: (() => void) | undefined;
    const fetcher = vi.fn(
      async (_path: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.method) return Response.json({ users });
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        await new Promise<void>((resolve) => {
          complete = resolve;
        });
        users = method === "POST" ? [reader] : [];
        return Response.json({ ok: true });
      },
    );
    vi.stubGlobal("fetch", fetcher);
    render(<AccessConsole />);
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    const input = screen.getByRole("textbox", { name: "メールアドレス" });
    if (method === "POST") {
      fireEvent.change(input, { target: { value: reader.email } });
      fireEvent.click(screen.getByRole("button", { name: "追加" }));
    } else {
      fireEvent.click(
        screen.getByRole("button", {
          name: `${reader.email} の閲覧権限を取り消す`,
        }),
      );
    }
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Failed to fetch");
    const retry = screen.getByRole("button", { name: "再試行" });
    fireEvent.click(retry);
    await waitFor(() => expect(attempts).toBe(2));
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: /追加/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /追加/ }));
    expect(attempts).toBe(2);
    complete?.();
    if (method === "POST") await screen.findByText("Reader");
    else await screen.findByText("閲覧者はいません。");
    expect(
      fetcher.mock.calls
        .filter(([, init]) => init?.method)
        .map(([, init]) => [init?.method, JSON.parse(String(init?.body))]),
    ).toEqual([
      [method, { email: reader.email }],
      [method, { email: reader.email }],
    ]);
  },
);

it("権限変更後の一覧取得だけが失敗した場合は完了と未確認を区別し、GETだけを再試行する", async () => {
  const reader = { id: "1", name: "Reader", email: "reader@example.test" };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ users: [] }))
    .mockResolvedValueOnce(Response.json({ ok: true }))
    .mockResolvedValueOnce(
      Response.json({ error: "unavailable" }, { status: 503 }),
    )
    .mockResolvedValueOnce(Response.json({ users: [reader] }));
  vi.stubGlobal("fetch", fetcher);
  render(<AccessConsole />);
  await screen.findByText("閲覧者はいません。");
  fireEvent.change(screen.getByRole("textbox", { name: "メールアドレス" }), {
    target: { value: reader.email },
  });
  fireEvent.click(screen.getByRole("button", { name: "追加" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("alert")).toHaveTextContent("追加は完了しました");
  fireEvent.click(screen.getByRole("button", { name: "再試行" }));
  await screen.findByText("Reader");
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
  ).toHaveLength(1);
});

it.each([
  { status: 401, deniedAt: "GET" },
  { status: 403, deniedAt: "GET" },
  { status: 401, deniedAt: "DELETE" },
  { status: 403, deniedAt: "DELETE" },
])(
  "成功一覧の後の$deniedAtが$statusなら一覧と変更操作を消し、再試行は権限の再確認だけを行う",
  async ({ status, deniedAt }) => {
    const reader = { id: "1", name: "Reader", email: "reader@example.test" };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ users: [reader] }));
    if (deniedAt === "GET")
      fetcher.mockResolvedValueOnce(Response.json({ ok: true }));
    fetcher
      .mockResolvedValueOnce(Response.json({ error: "denied" }, { status }))
      .mockResolvedValueOnce(Response.json({ users: [reader] }));
    vi.stubGlobal("fetch", fetcher);
    render(<AccessConsole />);
    await screen.findByText("Reader");
    if (deniedAt === "GET") {
      fireEvent.change(
        screen.getByRole("textbox", { name: "メールアドレス" }),
        {
          target: { value: "next@example.test" },
        },
      );
      fireEvent.click(screen.getByRole("button", { name: "追加" }));
    } else {
      fireEvent.click(
        screen.getByRole("button", {
          name: `${reader.email} の閲覧権限を取り消す`,
        }),
      );
    }
    await screen.findByRole("alert");
    expect(screen.queryByText("Reader")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "メールアドレス" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /閲覧権限を取り消す/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("閲覧者はいません。")).not.toBeInTheDocument();
    if (status === 401)
      expect(
        screen.getByRole("link", { name: "ログインする" }),
      ).toHaveAttribute("href", "/login?next=%2Fadmin%2Faccess");
    const callsBeforeRetry = fetcher.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    await screen.findByText("Reader");
    expect(fetcher.mock.calls[callsBeforeRetry]?.[1]?.method).toBeUndefined();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method)).toHaveLength(
      1,
    );
  },
);

it("意見のセクションは意見の閲覧者を表示し、付与・取消・再取得のすべてで意見権限を指定する", async () => {
  const fetcher = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({
      users: [
        {
          id: "feedback",
          name: "Feedback Reader",
          email: "feedback@example.test",
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<AccessConsole permission="feedback:read" />);
  await screen.findByText("Feedback Reader");
  expect(
    screen.getByRole("heading", { name: "意見閲覧権限" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "メールアドレス" }), {
    target: { value: "next@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "追加" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  fireEvent.click(
    screen.getByRole("button", {
      name: "feedback@example.test の閲覧権限を取り消す",
    }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5));
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual(
    Array(5).fill("/api/admin/access?permission=feedback%3Aread"),
  );
});

it("意見側の取得拒否も対象のセクション内で案内し、mainを入れ子にしない", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: RequestInfo | URL) =>
      String(path).includes("feedback")
        ? Response.json({ error: "denied" }, { status: 403 })
        : Response.json({ users: [] }),
    ),
  );
  render(<AccessManagement />);
  await screen.findByRole("alert");
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("region", { name: "意見閲覧権限" })).toContainElement(
    screen.getByRole("alert"),
  );
});
