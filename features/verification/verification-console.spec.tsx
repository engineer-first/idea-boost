import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VerificationConsole } from "./verification-console";

const token = "a".repeat(64);
function setup(failLink = false) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (input === "/api/verification/outcomes-link") {
      return failLink
        ? new Response(null, { status: 503 })
        : Response.json({ token });
    }
    return Response.json({ active: null });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

it("Ownerは画面を開くだけで閲覧リンクが表示され、取得操作を必要としない", async () => {
  const fetcher = setup();
  render(<VerificationConsole initialActive={null} isOwner />);
  expect(
    await screen.findByRole("link", { name: "成果一覧を開く" }),
  ).toHaveAttribute(
    "href",
    `${window.location.origin}/shared-outcomes#token=${token}`,
  );
  expect(
    screen.queryByRole("button", { name: "成果閲覧リンクを取得" }),
  ).not.toBeInTheDocument();
  expect(
    fetcher.mock.calls.filter(
      ([path]) => path === "/api/verification/outcomes-link",
    ),
  ).toHaveLength(1);
});

it("Owner以外はリンクを取得せず表示もしない", async () => {
  const fetcher = setup();
  render(<VerificationConsole initialActive={null} isOwner={false} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  expect(
    fetcher.mock.calls.some(
      ([path]) => path === "/api/verification/outcomes-link",
    ),
  ).toBe(false);
  expect(
    screen.queryByRole("link", { name: "成果一覧を開く" }),
  ).not.toBeInTheDocument();
});

it("リンク取得に失敗しても状態準備を妨げず、その場で再取得できる", async () => {
  const fetcher = setup(true);
  render(<VerificationConsole initialActive={null} isOwner />);
  fireEvent.click(
    await screen.findByRole("button", { name: "閲覧リンクを再取得" }),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(
        ([path]) => path === "/api/verification/outcomes-link",
      ),
    ).toHaveLength(2),
  );
  expect(screen.getByRole("button", { name: /3-1 アイデア/ })).toBeEnabled();
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "閲覧リンクを再取得" }),
  );
  expect(
    await screen.findByRole("link", { name: "成果一覧を開く" }),
  ).toBeInTheDocument();
});
