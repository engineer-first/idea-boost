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

describe("CanvasZoomControls", () => {
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

describe("操作ヒントのdismissとイベント配送", () => {
  function setupHelp() {
    const onOutside = vi.fn();
    const onToolChange = vi.fn();
    render(
      <>
        <CanvasZoomControls
          zoom={1}
          onToolChange={onToolChange}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          onZoomIn={vi.fn()}
          onFitToNotes={vi.fn()}
        />
        <button
          type="button"
          onPointerDown={onOutside}
          onClick={onOutside}
          onWheel={onOutside}
        >
          外側の操作
        </button>
      </>,
    );
    const summary = screen.getByLabelText("キャンバス操作のヒント");
    const details = summary.closest("details");
    if (!details) throw new Error("ヒントdetailsが必要");
    details.open = true;
    return { summary, details, onOutside, onToolChange };
  }
  it("外側pointerdownで閉じ、そのpointer操作を配送する", () => {
    const { details, onOutside } = setupHelp();
    expect(
      fireEvent.pointerDown(screen.getByRole("button", { name: "外側の操作" })),
    ).toBe(true);
    expect(details.open).toBe(false);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });
  it("native keyboard由来の外側clickで閉じ、そのclickを配送する", () => {
    const { details, onOutside } = setupHelp();
    expect(
      fireEvent.click(screen.getByRole("button", { name: "外側の操作" }), {
        detail: 0,
      }),
    ).toBe(true);
    expect(details.open).toBe(false);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });
  it("別ツール操作はヒントを閉じてそのまま切替を配送する", () => {
    const { details, onToolChange } = setupHelp();
    fireEvent.click(screen.getByRole("button", { name: "手のひらツール" }), {
      detail: 0,
    });
    expect(details.open).toBe(false);
    expect(onToolChange).toHaveBeenCalledWith("hand");
  });
  it("外側wheelで閉じ、その画面移動操作を配送する", () => {
    const { details, onOutside } = setupHelp();
    expect(
      fireEvent.wheel(screen.getByRole("button", { name: "外側の操作" }), {
        deltaY: 100,
      }),
    ).toBe(true);
    expect(details.open).toBe(false);
    expect(onOutside).toHaveBeenCalledTimes(1);
  });
  it("外側へfocusを移すと閉じ、そのfocusを奪わない", () => {
    const { details, summary } = setupHelp();
    summary.focus();
    const outside = screen.getByRole("button", { name: "外側の操作" });
    outside.focus();
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(outside);
  });
  it("内側のclick/scroll/selectとIME Escapeは閉じず通常Escapeだけ1段閉じる", () => {
    const { details, summary } = setupHelp();
    const panel = details.querySelector("section");
    if (!panel) throw new Error("ヒント本文が必要");
    fireEvent.pointerDown(panel);
    fireEvent.click(panel);
    fireEvent.scroll(panel);
    fireEvent.select(panel);
    fireEvent.keyDown(panel, { key: "Escape", isComposing: true });
    expect(details.open).toBe(true);
    expect(fireEvent.keyDown(panel, { key: "Escape" })).toBe(false);
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});

function HelpReadingCameraHarness() {
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

describe("ヒント本文のnative読書キーとHUDカメラ操作", () => {
  it.each([
    "ArrowDown",
    "ArrowUp",
    "ArrowLeft",
    "ArrowRight",
    "PageDown",
    "PageUp",
  ])("本文の%sはnative既定動作を保ちカメラへ漏れない", async (key) => {
    render(<HelpReadingCameraHarness />);
    const summary = screen.getByLabelText("キャンバス操作のヒント");
    const details = summary.closest("details");
    if (!details) throw new Error("ヒントdetailsが必要");
    details.open = true;
    const panel = screen.getByTestId("canvas-operation-help");
    panel.focus();
    const camera = screen.getByTestId("reading-camera");
    const before = camera.textContent;
    expect(fireEvent.keyDown(panel, { key })).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(camera.textContent).toBe(before);
    expect(details.open).toBe(true);
  });
  it("本文のIME・OS modifier・Spaceはnative入力のまま伝播する", () => {
    render(<HelpReadingCameraHarness />);
    const details = screen
      .getByLabelText("キャンバス操作のヒント")
      .closest("details");
    if (!details) throw new Error("ヒントdetailsが必要");
    details.open = true;
    const panel = screen.getByTestId("canvas-operation-help");
    const listener = vi.fn();
    window.addEventListener("keydown", listener);
    try {
      for (const options of [
        { isComposing: true },
        { keyCode: 229 },
        { ctrlKey: true },
        { metaKey: true },
        { altKey: true },
      ]) {
        expect(fireEvent.keyDown(panel, { key: "ArrowDown", ...options })).toBe(
          true,
        );
      }
      expect(fireEvent.keyDown(panel, { key: " ", code: "Space" })).toBe(true);
      expect(listener).toHaveBeenCalledTimes(6);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });
  it("通常のHUDボタン上のArrow/Pageは既存カメラ操作を維持する", async () => {
    render(<HelpReadingCameraHarness />);
    const button = screen.getByRole("button", { name: "キャンバスを縮小" });
    const camera = screen.getByTestId("reading-camera");
    for (const key of ["ArrowDown", "PageDown"]) {
      const before = camera.textContent;
      expect(fireEvent.keyDown(button, { key })).toBe(false);
      await waitFor(() => expect(camera.textContent).not.toBe(before));
    }
  });
});
