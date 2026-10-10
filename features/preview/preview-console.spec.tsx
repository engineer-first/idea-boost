import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PreviewConsole } from "./preview-console";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("通信エラーを日本語で案内してステップ選択を再開する", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValue(
        new DOMException("The operation was aborted", "TimeoutError"),
      ),
  );
  render(<PreviewConsole />);
  fireEvent.click(screen.getByRole("button", { name: /1-1/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "ルームを準備できませんでした",
  );
  expect(screen.getByRole("button", { name: /1-1/ })).toBeEnabled();
  expect(push).not.toHaveBeenCalled();
});
it("準備中に重ねて作成せず、成功したルームへ移動する", async () => {
  let finish: ((response: Response) => void) | undefined;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<PreviewConsole />);
  const button = screen.getByRole("button", { name: /3-5/ });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  finish?.(
    Response.json(
      {
        roomId: "b1000000-0000-4000-8000-000000000001",
        inviteCode: "ABC123",
        checkpoint: "3-5",
      },
      { status: 201 },
    ),
  );
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith(
      "/rooms/b1000000-0000-4000-8000-000000000001",
    ),
  );
});
