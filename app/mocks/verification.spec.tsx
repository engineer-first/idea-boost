import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerificationConsole } from "@/features/verification";
import { server } from "./node";
import { verificationHandlers } from "./verification";

describe("検証ページの通信", () => {
  it("2-3から3-1へ1クリックずつ準備でき、現在のルームを更新する", async () => {
    const onCreate = vi.fn();
    server.use(...verificationHandlers({ onCreate }));
    render(<VerificationConsole initialActive={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: /2-3 投票/ }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("2-3"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /3-1 アイデア/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /3-1 アイデア/ }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("3-1"));
    expect(
      await screen.findByRole("link", { name: /このルームを固定/ }),
    ).toBeInTheDocument();
  });
  it("作成エラーを表示して再操作できる", async () => {
    server.use(...verificationHandlers({ failCreate: true }));
    render(<VerificationConsole initialActive={null} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: /3-1 アイデア/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "検証操作に失敗",
    );
    expect(screen.getByRole("button", { name: /3-1 アイデア/ })).toBeEnabled();
  });
});
