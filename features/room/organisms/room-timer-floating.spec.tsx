import { fireEvent, render, screen } from "@testing-library/react";
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
