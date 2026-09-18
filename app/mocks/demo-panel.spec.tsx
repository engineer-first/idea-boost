import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEMO_MOCK_ROOM_ID, demoHandlers } from "@/app/mocks/demo";
import { server } from "@/app/mocks/node";
import { buildDemoStatus } from "@/contracts/demo.fixture";
import { DemoPanel } from "@/features/demo";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigate, refresh: vi.fn() }),
}));

describe("DemoPanel", () => {
  it("状況取得がタイムアウトしたらエラーと再取得操作を表示する", async () => {
    server.use(...demoHandlers());
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() =>
        AbortSignal.abort(new DOMException("Timeout", "TimeoutError")),
      );
    try {
      render(
        <DemoPanel
          roomId={DEMO_MOCK_ROOM_ID}
          initialStatus={buildDemoStatus()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "デモ操作" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "デモ操作に失敗しました",
      );
      expect(
        screen.getByRole("button", { name: "他4人が共有する" }),
      ).toBeDisabled();
    } finally {
      timeout.mockRestore();
    }
  });
  it("作り直しに失敗しても状況を再取得してエラーを解除できる", async () => {
    server.use(...demoHandlers({ failCreate: true }));
    render(
      <DemoPanel
        roomId={DEMO_MOCK_ROOM_ID}
        initialStatus={buildDemoStatus()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "デモ操作" }));
    fireEvent.click(screen.getByRole("button", { name: "やり直す" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "状況を再取得" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
  });
  it("初期状態は折り畳み、開くと取得するが他人の操作は自動実行しない", async () => {
    const onStatus = vi.fn();
    const onAction = vi.fn();
    server.use(...demoHandlers({ onStatus, onAction }));
    render(
      <DemoPanel
        roomId={DEMO_MOCK_ROOM_ID}
        initialStatus={buildDemoStatus()}
      />,
    );
    expect(screen.getByRole("button", { name: "デモ操作" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(onStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "デモ操作" }));
    await waitFor(() => expect(onStatus).toHaveBeenCalledTimes(1));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "他4人が共有する" }));
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({
        action: "share",
        phase: 1,
        step: 2,
      }),
    );
    expect(
      await screen.findByText("共有 4/4人・投票 0/4人"),
    ).toBeInTheDocument();
  });
  it("失敗した操作後は再取得して再試行できる", async () => {
    server.use(...demoHandlers({ failAction: true }));
    render(
      <DemoPanel
        roomId={DEMO_MOCK_ROOM_ID}
        initialStatus={buildDemoStatus()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "デモ操作" }));
    fireEvent.click(screen.getByRole("button", { name: "他4人が共有する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "デモ操作に失敗しました",
    );
    server.use(...demoHandlers());
    fireEvent.click(screen.getByRole("button", { name: "状況を再取得" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "他4人が共有する" }));
    expect(
      await screen.findByText("共有 4/4人・投票 0/4人"),
    ).toBeInTheDocument();
  });
  it("やり直すと元の見せ場を指定して新しいルームへ移動する", async () => {
    const onCreate = vi.fn();
    server.use(...demoHandlers({ onCreate }));
    render(
      <DemoPanel
        roomId={DEMO_MOCK_ROOM_ID}
        initialStatus={buildDemoStatus()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "デモ操作" }));
    fireEvent.click(screen.getByRole("button", { name: "やり直す" }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ checkpoint: "share" }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/rooms/${DEMO_MOCK_ROOM_ID}`),
    );
  });
});
