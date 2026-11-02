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
    isHost: true,
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
    expect(
      screen.queryByRole("button", { name: "付箋を書き足す" }),
    ).not.toBeInTheDocument();
  });

  it("共有が一巡したときは書き足し操作を実行できる", () => {
    const onRestartWriting = vi.fn();
    render(
      <RoomTimer
        {...props()}
        timer={{ status: "idle" }}
        sharingComplete
        onRestartWriting={onRestartWriting}
      />,
    );
    expect(screen.getByRole("timer")).toHaveAccessibleName(
      "共有が一巡しました",
    );
    expect(
      screen.getByRole("button", { name: "共有を続ける" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "付箋を書き足す" }));
    expect(onRestartWriting).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "次へ進む" }),
    ).not.toBeInTheDocument();
  });
});
