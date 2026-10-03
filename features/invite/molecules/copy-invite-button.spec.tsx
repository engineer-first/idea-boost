import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyInviteButton } from "./copy-invite-button";

const url = "https://idea-flow.example/invite/ABC234";
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
function stubClipboard(impl: () => Promise<void>) {
  const writeText = vi.fn(impl);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}
const button = () => screen.getByRole("button", { name: "招待URLをコピー" });
const clickCopy = async () => {
  await act(async () => fireEvent.click(button()));
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CopyInviteButton", () => {
  it.each([
    "text",
    "icon",
  ])("%s のクリックで表示した値をコピーし、文字列を置き換えない", async (target) => {
    const writeText = stubClipboard(() => Promise.resolve());
    render(<CopyInviteButton value={url} />);
    expect(writeText).not.toHaveBeenCalled();
    const control = button();
    const clicked =
      target === "text" ? screen.getByText(url) : control.querySelector("svg");
    expect(clicked).not.toBeNull();
    await act(async () => fireEvent.click(clicked as Element));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(url);
    expect(control).toHaveTextContent(url);
    expect(control).toHaveAttribute("data-copy-state", "success");
    expect(screen.getByRole("status")).toHaveTextContent(
      "招待URLをコピーしました",
    );
  });

  it("招待コードにも独立したコピー操作と結果がある", async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    render(
      <>
        <CopyInviteButton value={url} />
        <CopyInviteButton value="ABC234" itemLabel="招待コード" />
      </>,
    );
    const code = screen.getByRole("button", { name: "招待コードをコピー" });
    await act(async () => fireEvent.click(code));
    expect(writeText).toHaveBeenCalledExactlyOnceWith("ABC234");
    expect(code).toHaveTextContent("ABC234");
    expect(code).toHaveAttribute("data-copy-state", "success");
    expect(button()).toHaveAttribute("data-copy-state", "idle");
  });

  it.each([
    "success",
    "error",
  ] as const)("%s の結果を2秒だけ表示し、コピーアイコンへ戻す", async (result) => {
    stubClipboard(() =>
      result === "success"
        ? Promise.resolve()
        : Promise.reject(new Error("denied")),
    );
    render(<CopyInviteButton value={url} />);
    await clickCopy();
    expect(button()).toHaveAttribute("data-copy-state", result);
    expect(button()).toHaveTextContent(url);
    expect(screen.getByRole("status")).toHaveTextContent(
      result === "success" ? "コピーしました" : "コピーできませんでした",
    );
    act(() => vi.advanceTimersByTime(1999));
    expect(button()).toHaveAttribute("data-copy-state", result);
    act(() => vi.advanceTimersByTime(1));
    expect(button()).toHaveAttribute("data-copy-state", "idle");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("API非対応でも失敗を伝え、成功に見せない", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    render(<CopyInviteButton value={url} />);
    await clickCopy();
    expect(button()).toHaveAttribute("data-copy-state", "error");
    expect(button()).toBeEnabled();
  });

  it("コピー待ちの連打を抑制し、再試行の結果はその完了から2秒表示する", async () => {
    let resolve!: () => void;
    const writeText = stubClipboard(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<CopyInviteButton value={url} />);
    fireEvent.click(button());
    fireEvent.click(button());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(button()).toBeDisabled();
    await act(async () => resolve());
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(button());
    expect(button()).toHaveAttribute("data-copy-state", "idle");
    await act(async () => resolve());
    act(() => vi.advanceTimersByTime(500));
    expect(button()).toHaveAttribute("data-copy-state", "success");
    act(() => vi.advanceTimersByTime(1500));
    expect(button()).toHaveAttribute("data-copy-state", "idle");
  });

  it("成功後の再試行が失敗したら古い成功表示を残さない", async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    render(<CopyInviteButton value={url} />);
    await clickCopy();
    writeText.mockRejectedValueOnce(new Error("denied"));
    await clickCopy();
    expect(button()).toHaveAttribute("data-copy-state", "error");
  });

  it("ルーム変更後は前ルームの遅い結果とタイマーを持ち越さない", async () => {
    let resolve!: () => void;
    const writeText = stubClipboard(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const { rerender } = render(<CopyInviteButton value={url} />);
    fireEvent.click(button());
    rerender(
      <CopyInviteButton value="https://idea-flow.example/invite/NEW234" />,
    );
    await act(async () => resolve());
    expect(button()).toHaveAttribute("data-copy-state", "idle");
    expect(button()).toBeEnabled();
    expect(vi.getTimerCount()).toBe(0);
    writeText.mockResolvedValueOnce(undefined);
    await clickCopy();
    expect(writeText).toHaveBeenLastCalledWith(
      "https://idea-flow.example/invite/NEW234",
    );
  });

  it("アンマウント時に結果タイマーを破棄する", async () => {
    stubClipboard(() => Promise.resolve());
    const { unmount } = render(<CopyInviteButton value={url} />);
    await clickCopy();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
