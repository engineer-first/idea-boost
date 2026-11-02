import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountLinkButtonLabel,
  accountLinkGuestNotice,
} from "../logic/account-link-copy";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("../logic/account-link-actions", () => ({
  startGoogleAccountLink: mocks.start,
}));

import { AccountLinkSection } from "./account-link-section";

beforeEach(() => vi.resetAllMocks());
describe("Google連携の案内", () => {
  it("ゲストのボタンを押すとnextだけを渡して連携を開始する", async () => {
    mocks.start.mockResolvedValue(undefined);
    render(
      <AccountLinkSection status="guest" next="/rooms?from=guest#result" />,
    );
    const button = screen.getByRole("button", {
      name: accountLinkButtonLabel,
    });
    expect(
      screen.getByRole("region", { name: "Googleとの連携" }),
    ).toBeVisible();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() =>
      expect(mocks.start).toHaveBeenCalledExactlyOnceWith(
        "/rooms?from=guest#result",
      ),
    );
  });
  it("送信中はボタンを無効にして重複送信を防ぐ", async () => {
    const pending = Promise.withResolvers<void>();
    mocks.start.mockReturnValue(pending.promise);
    render(<AccountLinkSection status="guest" next="/rooms" />);
    const button = screen.getByRole("button", { name: accountLinkButtonLabel });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(
      screen.getByRole("button", { name: "Googleへ移動しています…" }),
    ).toBe(button);
    fireEvent.click(button);
    expect(mocks.start).toHaveBeenCalledOnce();
    await act(async () => pending.resolve());
    await waitFor(() => expect(button).toBeEnabled());
  });
  it("連携済みでは説明だけを表示しボタンを出さない", () => {
    render(<AccountLinkSection status="linked" next="/rooms" />);
    expect(
      screen.getByRole("region", { name: "Googleとの連携" }),
    ).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Googleと連携済みです/)).toBeInTheDocument();
  });
  it("連携直後は成功結果だけを表示して連携済みの説明を重複させない", () => {
    render(
      <AccountLinkSection status="linked" next="/rooms" result="linked" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Googleと連携しました。",
    );
    expect(screen.queryByText(/Googleと連携済みです/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("結果の固定文言をstatusとして表示する", () => {
    render(
      <AccountLinkSection status="guest" next="/rooms" result="cancelled" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Googleとの連携をやめました。このまま引き続き使えます。",
    );
  });
});

it.each(["guest", "linked"] as const)(
  "%sでもalready_linkedなら結果だけを表示する",
  (status) => {
    render(
      <AccountLinkSection
        status={status}
        next="/home"
        result="already_linked"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "この記録はすでに別のGoogleアカウントと連携しています。",
    );
    expect(
      screen.queryByRole("button", { name: accountLinkButtonLabel }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(accountLinkGuestNotice)).not.toBeInTheDocument();
    expect(screen.queryByText(/Googleと連携済みです/)).not.toBeInTheDocument();
  },
);
it("結果ありでマウントすると結果段落へ一度だけフォーカスする", () => {
  const { rerender } = render(
    <AccountLinkSection status="guest" next="/home" result="failed" />,
  );
  const result = screen.getByRole("status");
  expect(result).toHaveFocus();
  const button = screen.getByRole("button", { name: accountLinkButtonLabel });
  button.focus();
  rerender(
    <AccountLinkSection status="guest" next="/home" result="cancelled" />,
  );
  expect(button).toHaveFocus();
});
it("結果なしでマウントするとほかの操作からフォーカスを奪わない", () => {
  render(<button type="button">別の操作</button>);
  const other = screen.getByRole("button", { name: "別の操作" });
  other.focus();
  render(<AccountLinkSection status="guest" next="/home" />);
  expect(other).toHaveFocus();
});
