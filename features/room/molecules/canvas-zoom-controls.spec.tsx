import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasZoomControls } from "./canvas-zoom-controls";

describe("CanvasZoomControls", () => {
  it("倍率を表示し、各操作を通知する", () => {
    const handlers = {
      onZoomOut: vi.fn(),
      onResetZoom: vi.fn(),
      onZoomIn: vi.fn(),
      onFitToNotes: vi.fn(),
    };
    render(<CanvasZoomControls zoom={1.25} {...handlers} />);

    expect(screen.getByText("125%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンバスを縮小" }));
    fireEvent.click(screen.getByRole("button", { name: "ズームを100%に戻す" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンバスを拡大" }));
    fireEvent.click(screen.getByRole("button", { name: "付箋全体を表示" }));

    expect(handlers.onZoomOut).toHaveBeenCalledTimes(1);
    expect(handlers.onResetZoom).toHaveBeenCalledTimes(1);
    expect(handlers.onZoomIn).toHaveBeenCalledTimes(1);
    expect(handlers.onFitToNotes).toHaveBeenCalledTimes(1);
  });
});
