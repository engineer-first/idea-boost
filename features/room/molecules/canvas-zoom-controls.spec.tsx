import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useCanvasCamera } from "../logic/use-canvas-camera";
import { CanvasZoomControls } from "./canvas-zoom-controls";
import { SharingReactionControls } from "./sharing-reaction-controls";

describe("CanvasZoomControls", () => {
  it("盤面操作中は開いているリアクションからの送信を止め、解除後に再送できる", () => {
    const onSendReaction = vi.fn();
    const props = {
      zoom: 1,
      onZoomOut: vi.fn(),
      onResetZoom: vi.fn(),
      onZoomIn: vi.fn(),
      onFitToNotes: vi.fn(),
      reactionControls: (disabled: boolean) => (
        <SharingReactionControls
          disabled={disabled}
          onSendReaction={onSendReaction}
        />
      ),
    };
    const { rerender } = render(<CanvasZoomControls {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "リアクション" }));
    const question = screen.getByRole("button", {
      name: "どうして？のリアクションを送る",
    });
    rerender(<CanvasZoomControls {...props} toolDisabled />);
    expect(question).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(question);
    expect(onSendReaction).not.toHaveBeenCalled();
    rerender(<CanvasZoomControls {...props} toolDisabled={false} />);
    expect(question).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(question);
    expect(onSendReaction).toHaveBeenCalledExactlyOnceWith("question");
  });

  it("固定マップでは視野操作を隠し、移動履歴だけを残す", () => {
    const moveHistory = {
      undo: { label: "付箋の移動", reason: null, disabled: false },
      redo: { label: "付箋の移動", reason: null, disabled: false },
      pending: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    };
    render(
      <CanvasZoomControls
        moveHistory={moveHistory}
        showNavigationControls={false}
        zoom={0.11}
        onZoomOut={vi.fn()}
        onResetZoom={vi.fn()}
        onZoomIn={vi.fn()}
        onFitToNotes={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "移動を元に戻す" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "キャンバスを拡大" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "手のひらツール" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("canvas-operation-help"),
    ).not.toBeInTheDocument();
  });

  it("統合した移動履歴のクリックを通知し、反映中は両操作を止める", () => {
    const moveHistory = {
      undo: { label: "2枚の付箋の移動", reason: null, disabled: false },
      redo: { label: "2枚の付箋の移動", reason: null, disabled: false },
      pending: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
    };
    const props = {
      zoom: 1,
      onToolChange: vi.fn(),
      onZoomOut: vi.fn(),
      onResetZoom: vi.fn(),
      onZoomIn: vi.fn(),
      onFitToNotes: vi.fn(),
      moveHistory,
    };
    const view = render(<CanvasZoomControls {...props} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const undo = screen.getByRole("button", { name: "移動を元に戻す" });
    const redo = screen.getByRole("button", { name: "移動をやり直す" });
    fireEvent.click(undo);
    fireEvent.click(redo);
    expect(moveHistory.onUndo).toHaveBeenCalledTimes(1);
    expect(moveHistory.onRedo).toHaveBeenCalledTimes(1);
    view.rerender(
      <CanvasZoomControls
        {...props}
        moveHistory={{ ...moveHistory, pending: true }}
      />,
    );
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("移動を反映");
    fireEvent.click(undo);
    fireEvent.click(redo);
    expect(moveHistory.onUndo).toHaveBeenCalledTimes(1);
    expect(moveHistory.onRedo).toHaveBeenCalledTimes(1);
  });

  it("無効な移動履歴もフォーカスで理由とショートカットを読める", () => {
    const reason = "ほかの人の変更があるため、この移動は戻せません。";
    const props = {
      zoom: 1,
      onZoomOut: vi.fn(),
      onResetZoom: vi.fn(),
      onZoomIn: vi.fn(),
      onFitToNotes: vi.fn(),
      moveHistory: {
        undo: { label: "2枚の付箋の移動", reason, disabled: true },
        redo: {
          label: "やり直せる移動はありません",
          reason: null,
          disabled: true,
        },
        pending: false,
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      },
    };
    render(<CanvasZoomControls {...props} />);
    const undo = screen.getByRole("button", { name: "移動を元に戻す" });
    expect(undo).toBeDisabled();
    const trigger = undo.parentElement;
    if (!trigger)
      throw new Error("無効時にもフォーカスできるtooltip triggerが必要");
    act(() => trigger.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent(reason);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Ctrl / Cmd + Z");
    expect(props.moveHistory.onUndo).not.toHaveBeenCalled();
  });

  it("手のひらのヒントはhoverの0.2秒後に表示し、離れた場合は表示しない", () => {
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
      act(() => vi.advanceTimersByTime(100));
      fireEvent.pointerLeave(hand);
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

      fireEvent.pointerMove(hand, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(199));
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
      expect(screen.getByRole("tooltip")).toHaveTextContent("選択（V）");
      expect(screen.getByRole("tooltip")).not.toHaveTextContent("背景で");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ツールチップは明るい面と枠線で表示する", () => {
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
    fireEvent.focus(screen.getByRole("button", { name: "選択ツール" }));
    const content = document.querySelector('[data-slot="tooltip-content"]');
    expect(content).toHaveClass(
      "border",
      "border-border",
      "bg-popover",
      "text-popover-foreground",
    );
    expect(content).not.toHaveClass("bg-foreground", "text-background");
  });

  it("キャンバス操作の?ヒントは表示しない", () => {
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
    expect(
      screen.queryByLabelText("キャンバス操作のヒント"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("canvas-operation-help"),
    ).not.toBeInTheDocument();
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
    expect(
      screen.queryByRole("dialog", { name: "キャンバスのズーム" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンバスを拡大" }));
    fireEvent.click(screen.getByRole("button", { name: "付箋全体を表示" }));

    expect(handlers.onZoomOut).toHaveBeenCalledTimes(1);
    expect(handlers.onResetZoom).toHaveBeenCalledTimes(1);
    expect(handlers.onZoomIn).toHaveBeenCalledTimes(1);
    expect(handlers.onFitToNotes).toHaveBeenCalledTimes(1);
  });
});

function CameraHarness() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { camera } = useCanvasCamera({ viewportRef, notes: [] });
  return (
    <div>
      <div ref={viewportRef} />
      <output data-testid="reading-camera">{JSON.stringify(camera)}</output>
      <CanvasZoomControls
        zoom={1}
        onZoomOut={vi.fn()}
        onResetZoom={vi.fn()}
        onZoomIn={vi.fn()}
        onFitToNotes={vi.fn()}
      />
    </div>
  );
}

describe("HUDのカメラ操作", () => {
  it("通常のHUDボタン上のArrow/Pageは既存カメラ操作を維持する", async () => {
    render(<CameraHarness />);
    const button = screen.getByRole("button", { name: "キャンバスを縮小" });
    const camera = screen.getByTestId("reading-camera");
    for (const key of ["ArrowDown", "PageDown"]) {
      const before = camera.textContent;
      expect(fireEvent.keyDown(button, { key })).toBe(false);
      await waitFor(() => expect(camera.textContent).not.toBe(before));
    }
  });
});
