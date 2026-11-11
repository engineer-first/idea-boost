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
const created = (roomId: string, checkpoint: string) =>
  Response.json({ roomId, inviteCode: "ABC123", checkpoint }, { status: 201 });
function fakeTab() {
  return { location: { href: "about:blank" }, focus: vi.fn(), close: vi.fn() };
}
it("ステップのルームを別タブで開き、選び直すと同じタブを新しいルームへ切り替える", async () => {
  const tab = fakeTab();
  const open = vi.spyOn(window, "open").mockReturnValue(tab as never);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        created("b1000000-0000-4000-8000-000000000021", "2-1"),
      )
      .mockResolvedValueOnce(
        created("b1000000-0000-4000-8000-000000000031", "3-1"),
      ),
  );
  render(<PreviewConsole />);
  fireEvent.click(screen.getByRole("button", { name: /2-1/ }));
  await waitFor(() =>
    expect(tab.location.href).toBe(
      "/rooms/b1000000-0000-4000-8000-000000000021",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /3-1/ }));
  await waitFor(() =>
    expect(tab.location.href).toBe(
      "/rooms/b1000000-0000-4000-8000-000000000031",
    ),
  );
  expect(open).toHaveBeenCalledTimes(2);
  expect(new Set(open.mock.calls.map((call) => call[1])).size).toBe(1);
  expect(tab.focus).toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  open.mockRestore();
});
it("新しく開いた空のタブは、作成に失敗したら閉じる", async () => {
  const tab = fakeTab();
  const open = vi.spyOn(window, "open").mockReturnValue(tab as never);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: "x" }, { status: 503 })),
  );
  render(<PreviewConsole />);
  fireEvent.click(screen.getByRole("button", { name: /1-1/ }));
  await screen.findByRole("alert");
  expect(tab.close).toHaveBeenCalled();
  open.mockRestore();
});
it("準備中に重ねて作成せず、タブを開けなければこのタブで移動する", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
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
  open.mockRestore();
});
it("作成を断られた理由をそのまま案内する", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: "別のルームへの移動を処理しています。" },
          { status: 409 },
        ),
      ),
  );
  render(<PreviewConsole />);
  fireEvent.click(screen.getByRole("button", { name: /2-1/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "別のルームへの移動を処理しています。",
  );
});
