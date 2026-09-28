import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccessConsole } from "./access-console";

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
      name: "reader@example.test の閲覧権限を削除",
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
