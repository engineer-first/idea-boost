import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteUrlActions } from "./invite-url-actions";

const url = "https://idea-flow.example/invite/ABC234";
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
function stubShare(share: unknown) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
}
afterEach(() => {
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else Reflect.deleteProperty(navigator, "share");
  vi.restoreAllMocks();
});

describe("InviteUrlActions", () => {
  it("クリックしたときだけURL単独のpayloadを共有し、送信完了とは表示しない", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);
    render(<InviteUrlActions value={url} />);
    expect(share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "招待URLを共有" }));
    expect(share).toHaveBeenCalledExactlyOnceWith({ url });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "招待URLを共有" }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText(
        "共有できませんでした。URLをコピーして送ってください。",
      ),
    ).not.toBeInTheDocument();
  });

  it("非対応でもURL全体をコピーでき、手動コピー欄は表示しない", async () => {
    stubShare(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<InviteUrlActions value={url} />);
    expect(
      screen.queryByRole("button", { name: "招待URLを共有" }),
    ).not.toBeInTheDocument();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "招待URLをコピー" })),
    );
    expect(writeText).toHaveBeenCalledWith(url);
    expect(screen.queryByText("URLを手動でコピー")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("キャンセルは中立で、再共有できる", async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("cancel", "AbortError"))
      .mockResolvedValue(undefined);
    stubShare(share);
    render(<InviteUrlActions value={url} />);
    fireEvent.click(screen.getByRole("button", { name: "招待URLを共有" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "招待URLを共有" }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText(
        "共有できませんでした。URLをコピーして送ってください。",
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "招待URLを共有" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
  });

  it.each([
    "NotAllowedError",
    "DataError",
    "TypeError",
  ])("%s失敗後もコピーでき、成功表示を出さない", async (name) => {
    stubShare(vi.fn().mockRejectedValue(new DOMException("failure", name)));
    render(<InviteUrlActions value={url} />);
    fireEvent.click(screen.getByRole("button", { name: "招待URLを共有" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "招待URLを共有" }),
      ).toHaveAttribute("data-share-state", "error"),
    );
    expect(
      screen.getByText("共有できませんでした。URLをコピーして送ってください。"),
    ).toHaveClass("sr-only");
    expect(
      screen.getByRole("button", { name: "招待URLをコピー" }),
    ).toBeEnabled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("共有しました")).not.toBeInTheDocument();
  });

  it("共有待ちの連打を抑制する", async () => {
    let resolve!: () => void;
    const share = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    stubShare(share);
    render(<InviteUrlActions value={url} />);
    const button = screen.getByRole("button", { name: "招待URLを共有" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(share).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => resolve());
    expect(button).toBeEnabled();
  });

  it("ルーム変更後に前ルームの共有失敗を表示しない", async () => {
    let reject!: (error: Error) => void;
    stubShare(
      vi.fn(
        () =>
          new Promise<void>((_, fail) => {
            reject = fail;
          }),
      ),
    );
    const { rerender } = render(<InviteUrlActions value={url} />);
    fireEvent.click(screen.getByRole("button", { name: "招待URLを共有" }));
    rerender(
      <InviteUrlActions value="https://idea-flow.example/invite/NEW234" />,
    );
    await act(async () => reject(new Error("failure")));
    expect(
      screen.queryByText(
        "共有できませんでした。URLをコピーして送ってください。",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "招待URLをコピー" }),
    ).toHaveTextContent("NEW234");
  });
  it("共有の文言を固定し、失敗アイコンは2秒で戻す", async () => {
    vi.useFakeTimers();
    try {
      stubShare(vi.fn().mockRejectedValue(new Error("failure")));
      const { unmount } = render(<InviteUrlActions value={url} />);
      const share = screen.getByRole("button", { name: "招待URLを共有" });
      await act(async () => fireEvent.click(share));
      expect(share).toHaveTextContent("共有");
      expect(share).toHaveAttribute("data-share-state", "error");
      act(() => vi.advanceTimersByTime(1999));
      expect(share).toHaveAttribute("data-share-state", "error");
      act(() => vi.advanceTimersByTime(1));
      expect(share).toHaveAttribute("data-share-state", "idle");
      await act(async () => fireEvent.click(share));
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
