import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasZoomControls } from "./canvas-zoom-controls";

describe("CanvasZoomControls", () => {
  it("手のひらのヒントはhoverの1秒後に表示し、離れた場合は表示しない", () => {
    vi.useFakeTimers();
    try {
      render(
        <CanvasZoomControls
          zoom={1}
          onToolChange={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          onZoomIn={vi.fn()}
          onFitToNotes={vi.fn()}
        />,
      );
      const hand = screen.getByRole("button", { name: "手のひらツール" });
      fireEvent.pointerMove(hand, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(500));
      fireEvent.pointerLeave(hand);
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

      fireEvent.pointerMove(hand, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(999));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Space＋ドラッグ");
    } finally {
      vi.useRealTimers();
    }
  });

  it("表示済みの手のひらから隣の選択ツールへ移るとヒントをすぐ切り替える", () => {
    vi.useFakeTimers();
    try {
      render(
        <CanvasZoomControls
          zoom={1}
          onToolChange={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          onZoomIn={vi.fn()}
          onFitToNotes={vi.fn()}
        />,
      );
      fireEvent.pointerMove(
        screen.getByRole("button", { name: "手のひらツール" }),
        { pointerType: "mouse" },
      );
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByRole("tooltip")).toHaveTextContent("Space＋ドラッグ");
      fireEvent.pointerMove(
        screen.getByRole("button", { name: "選択ツール" }),
        { pointerType: "mouse" },
      );
      expect(screen.getByRole("tooltip")).toHaveTextContent("選択（背景でV）");
    } finally {
      vi.useRealTimers();
    }
  });

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
