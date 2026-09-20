import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerificationView } from "./verification-view";

describe("検証の操作ページ", () => {
  const props = {
    active: null,
    status: null,
    pending: false,
    error: null,
    isOwner: true,
    onCreate: vi.fn(),
    onVote: vi.fn(),
    onRetry: vi.fn(),
  };
  it("各ステップを1クリックで準備でき、ボードは専用タブで開く", () => {
    render(<VerificationView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /3-1 アイデア/ }));
    expect(props.onCreate).toHaveBeenCalledWith("3-1");
    expect(
      screen.getByRole("link", { name: "検証ボードを開く" }),
    ).toHaveAttribute("target", "idea-boost-verification");
    expect(screen.getByText(/まだ検証ルーム/)).toBeInTheDocument();
  });
  it("参加者は検証ルームを作り直せない", () => {
    render(<VerificationView {...props} isOwner={false} />);
    expect(
      screen.queryByRole("button", { name: /3-1 アイデア/ }),
    ).not.toBeInTheDocument();
  });
  it("作成中は連打を防ぎ、失敗は再取得できる", () => {
    const { rerender } = render(<VerificationView {...props} pending />);
    expect(screen.getByRole("button", { name: /3-1 アイデア/ })).toBeDisabled();
    rerender(<VerificationView {...props} error="通信に失敗しました" />);
    expect(screen.getByRole("alert")).toHaveTextContent("通信に失敗しました");
    fireEvent.click(screen.getByRole("button", { name: "再取得" }));
    expect(props.onRetry).toHaveBeenCalled();
  });
});
