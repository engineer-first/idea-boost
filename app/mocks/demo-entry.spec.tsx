import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEMO_MOCK_ROOM_ID, demoHandlers } from "@/app/mocks/demo";
import { server } from "@/app/mocks/node";
import { DemoEntry } from "@/features/demo";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigate, refresh: vi.fn() }),
}));
describe("DemoEntry", () => {
  it("14ステップの見せ場から選んでホストとして開始する", async () => {
    const onCreate = vi.fn();
    server.use(...demoHandlers({ onCreate }));
    render(<DemoEntry />);
    expect(screen.getAllByRole("radio")).toHaveLength(14);
    expect(screen.getByRole("radio", { name: /1-3/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(
      /分|秒/,
    );
    fireEvent.click(screen.getByRole("radio", { name: /1-4/ }));
    fireEvent.click(screen.getByRole("button", { name: "デモを開始" }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ checkpoint: "vote" }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/rooms/${DEMO_MOCK_ROOM_ID}`),
    );
  });
  it("作成エラーを表示し同じ選択で再試行できる", async () => {
    server.use(...demoHandlers({ failCreate: true }));
    render(<DemoEntry />);
    fireEvent.click(screen.getByRole("button", { name: "デモを開始" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "デモ操作に失敗しました",
    );
    expect(screen.getByRole("button", { name: "デモを開始" })).toBeEnabled();
  });
});
