import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomTimer } from "./room-timer";
import {
  buildEndedTimer,
  buildRunningTimer,
  ROOM_TIMER_FIXTURE_NOW,
} from "./room-timer.fixture";

function props() {
  return {
    timer: buildRunningTimer({ remainingMs: 150_000, durationMs: 300_000 }),
    serverOffsetMs: 0,
    now: () => ROOM_TIMER_FIXTURE_NOW,

    disabled: false,
    initialDurationMs: 300_000,
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onExtend: vi.fn(),
    onStop: vi.fn(),
    onNext: vi.fn(),
    soundControls: {
      enabled: false,
      playbackBlocked: false,
      onEnable: vi.fn(),
      onMute: vi.fn(),
    },
  };
}

describe("フローティングタイマー", () => {
  it("後から現れるHUDを避け、そのHUDのサイズ変更にも追従し、監視を解除する", async () => {
    const observed = new Set<Element>();
    let resize: () => void = () => {};
    let hudRect = new DOMRect(1160, 80, 108, 240);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe(element: Element) {
          observed.add(element);
        }
        disconnect() {
          observed.clear();
        }
      },
    );
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.testid === "room-board-view-root")
          return new DOMRect(0, 0, 1280, 720);
        if (this.dataset.testid === "board-control-hud")
          return new DOMRect(900, 12, 368, 56);
        if (this.dataset.testid === "idea-map-size-controls-hud")
          return hudRect;
        return originalRect.call(this);
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().width;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().height;
      },
    );
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const p = props();
    const board = (showHud: boolean) => (
      <div data-testid="room-board-view-root">
        <div data-testid="board-control-hud" />
        <RoomTimer {...p} />
        {showHud ? <div data-testid="idea-map-size-controls-hud" /> : null}
      </div>
    );
    const view = render(board(false));
    try {
      const floating = screen.getByTestId("timer-floating");
      const mutationObserver =
        observe.mock.contexts[
          observe.mock.calls.findIndex(
            ([target]) => target === screen.getByTestId("room-board-view-root"),
          )
        ];
      expect(mutationObserver).toBeDefined();
      expect(floating.style.left).toBe("1196px");
      view.rerender(board(true));
      const hud = screen.getByTestId("idea-map-size-controls-hud");
      await waitFor(() => expect(observed.has(hud)).toBe(true));
      expect(Number.parseFloat(floating.style.left) + 72).toBeLessThanOrEqual(
        hudRect.left - 12,
      );
      hudRect = new DOMRect(0, 80, 1280, 240);
      act(() => resize());
      expect(Number.parseFloat(floating.style.top)).toBeGreaterThanOrEqual(
        hudRect.bottom + 12,
      );
      view.unmount();
      expect(observed.size).toBe(0);
      expect(disconnect.mock.contexts).toContain(mutationObserver);
    } finally {
      view.unmount();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
  it("中央付近へドラッグして離すと、その場に留まらず作業領域の最寄りの端へ寄る", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.testid === "room-board-view-root")
          return new DOMRect(0, 0, 1280, 720);
        if (this.dataset.testid === "board-control-hud")
          return new DOMRect(900, 12, 368, 56);
        return new DOMRect(0, 0, 0, 0);
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().width;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().height;
      },
    );
    const view = render(
      <div data-testid="room-board-view-root">
        <div data-testid="board-control-hud" />
        <RoomTimer {...props()} />
      </div>,
    );
    try {
      const floating = screen.getByTestId("timer-floating");
      expect(floating.style.left).toBe("1196px");
      expect(floating.style.top).toBe("80px");
      fireEvent.pointerDown(floating, {
        pointerId: 1,
        button: 0,
        clientX: 1232,
        clientY: 116,
      });
      fireEvent.pointerMove(floating, {
        pointerId: 1,
        clientX: 700,
        clientY: 400,
      });
      // ドラッグ中は指に付いてくる
      expect(floating.style.left).toBe("664px");
      expect(floating.style.top).toBe("364px");
      fireEvent.pointerUp(floating, { pointerId: 1 });
      // 下端が最も近いので、横位置を保って下端へ寄る
      expect(floating.style.left).toBe("664px");
      expect(floating.style.top).toBe("636px");
    } finally {
      view.unmount();
      vi.restoreAllMocks();
    }
  });
  it("上中央のステップ表示の近くで離しても、ステップ表示に重ねず上端の空きへ寄る", () => {
    const trail = new DOMRect(400, 0, 480, 120);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.testid === "room-board-view-root")
          return new DOMRect(0, 0, 1280, 720);
        if (this.dataset.testid === "board-control-hud")
          return new DOMRect(900, 12, 368, 56);
        if (this.dataset.testid === "phase-step-trail") return trail;
        return new DOMRect(0, 0, 0, 0);
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().width;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().height;
      },
    );
    const view = render(
      <div data-testid="room-board-view-root">
        <div data-testid="board-control-hud" />
        <div data-testid="phase-step-trail" />
        <RoomTimer {...props()} />
      </div>,
    );
    try {
      const floating = screen.getByTestId("timer-floating");
      fireEvent.pointerDown(floating, {
        pointerId: 1,
        button: 0,
        clientX: 1232,
        clientY: 116,
      });
      fireEvent.pointerMove(floating, {
        pointerId: 1,
        clientX: 640,
        clientY: 200,
      });
      fireEvent.pointerUp(floating, { pointerId: 1 });
      const left = Number.parseFloat(floating.style.left);
      const top = Number.parseFloat(floating.style.top);
      const overlapsTrail =
        left < trail.right &&
        left + 72 > trail.left &&
        top < trail.bottom &&
        top + 72 > trail.top;
      expect(overlapsTrail).toBe(false);
      // その場（top 164）に残らず、ステップ表示の横の上端へ寄る
      expect(top).toBe(12);
    } finally {
      view.unmount();
      vi.restoreAllMocks();
    }
  });
  it("端へ寄せた後に作業領域が広がっても、同じ辺に付け直す。寄る途中に掴み直すと動きの印を外す", () => {
    let rootRect = new DOMRect(0, 0, 1280, 720);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.testid === "room-board-view-root") return rootRect;
        if (this.dataset.testid === "board-control-hud")
          return new DOMRect(900, 12, 368, 56);
        return new DOMRect(0, 0, 0, 0);
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().width;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getBoundingClientRect().height;
      },
    );
    const view = render(
      <div data-testid="room-board-view-root">
        <div data-testid="board-control-hud" />
        <RoomTimer {...props()} />
      </div>,
    );
    try {
      const floating = screen.getByTestId("timer-floating");
      fireEvent.pointerDown(floating, {
        pointerId: 1,
        button: 0,
        clientX: 1232,
        clientY: 116,
      });
      fireEvent.pointerMove(floating, {
        pointerId: 1,
        clientX: 700,
        clientY: 400,
      });
      fireEvent.pointerUp(floating, { pointerId: 1 });
      expect(floating.style.top).toBe("636px");
      expect(floating.dataset.snapping).toBe("true");
      fireEvent.pointerDown(floating, {
        pointerId: 2,
        button: 0,
        clientX: 700,
        clientY: 672,
      });
      expect(floating.dataset.snapping).toBeUndefined();
      fireEvent.pointerUp(floating, { pointerId: 2 });
      rootRect = new DOMRect(0, 0, 1280, 900);
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      // 下端に寄せたので、高さが増えても新しい下端に付く
      expect(floating.style.top).toBe("816px");
      expect(floating.style.left).toBe("664px");
    } finally {
      view.unmount();
      vi.restoreAllMocks();
    }
  });
  it("稼働中は残り時間を読み上げられ、時間設定や延長・進行操作を表示しない", () => {
    render(<RoomTimer {...props()} />);
    expect(screen.getByRole("timer")).toHaveAccessibleName(/02:30/);
    expect(screen.getByTestId("room-timer-disk")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("room-timer"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+1分" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "次へ進む" }),
    ).not.toBeInTheDocument();
  });

  it("開始前の円を押すと設定画面を開かず工程の規定時間で開始する", () => {
    const p = props();
    render(<RoomTimer {...p} timer={{ status: "idle" }} />);
    fireEvent.click(screen.getByTestId("room-timer"));
    expect(p.onStart).toHaveBeenCalledWith(300_000);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("終了すると1分延長を選べる", () => {
    const p = props();
    render(
      <RoomTimer {...p} timer={buildEndedTimer({ durationMs: 60_000 })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "＋1分" }));
    expect(p.onExtend).toHaveBeenCalledOnce();
    expect(p.onStart).not.toHaveBeenCalled();
  });
});
