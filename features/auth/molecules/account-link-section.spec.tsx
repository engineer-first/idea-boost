import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      name: "Googleと連携して、別の端末からも記録を見返す",
    });
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
    const button = screen.getByRole("button");
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    expect(mocks.start).toHaveBeenCalledOnce();
    await act(async () => pending.resolve());
    await waitFor(() => expect(button).toBeEnabled());
  });
  it("連携済みでは説明だけを表示しボタンを出さない", () => {
    render(<AccountLinkSection status="linked" next="/rooms" />);
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
