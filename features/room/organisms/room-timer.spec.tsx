import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomTimer, TIMER_DEFAULT_DURATION_MS } from "./room-timer";
import {
  buildEndedTimer,
  buildPausedTimer,
  buildRunningTimer,
  ROOM_TIMER_FIXTURE_NOW,
} from "./room-timer.fixture";

const handlers = {
  onStart: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onExtend: vi.fn(),
  onStop: vi.fn(),
};

describe("RoomTimer", () => {
  it.each([
    { status: "idle" } as const,
    buildRunningTimer(),
    buildPausedTimer(),
    buildEndedTimer(),
  ])("$status の背景は不透明で、文字や面を点滅させない", (timer) => {
    render(
      <RoomTimer
        timer={timer}
        serverOffsetMs={0}
        isHost
        disabled
        defaultPanelOpen
        {...handlers}
      />,
    );
    const chip = screen.getByTestId("room-timer");
    expect(chip).toHaveClass("bg-background", "disabled:opacity-100");
    expect(chip).not.toHaveClass("animate-pulse");
    expect(screen.getByTestId("room-timer-panel")).toHaveClass("bg-background");
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(ROOM_TIMER_FIXTURE_NOW);
    vi.clearAllMocks();
  });

  afterEach(() => vi.useRealTimers());

  const openPanel = () => {
    fireEvent.click(screen.getByTestId("room-timer"));
    expect(screen.getByTestId("room-timer")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByTestId("room-timer-panel")).toBeInTheDocument();
  };

  it("デフォルトのセット時間は定数化された 03:00", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        {...handlers}
      />,
    );
    expect(TIMER_DEFAULT_DURATION_MS).toBe(180_000);
    const chip = screen.getByTestId("room-timer");
    expect(chip).toHaveTextContent("タイマー");
    expect(chip).toHaveAttribute("aria-expanded", "false");
    expect(chip).toHaveClass("h-10", "w-28");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1分" })).toBeNull();
    expect(screen.queryByRole("button", { name: "3分" })).toBeNull();
    expect(screen.queryByRole("button", { name: "5分" })).toBeNull();
    expect(screen.queryByRole("button", { name: "10分" })).toBeNull();
    expect(screen.queryByTestId("room-timer-panel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("タイマー時間（分）")).toBeNull();
    openPanel();
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue("03");
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("00");
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveAttribute(
      "placeholder",
      "00",
    );
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveAttribute(
      "placeholder",
      "00",
    );
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("room-timer-panel")).not.toBeInTheDocument();
  });

  it("00:00 は開始できない", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        initialDurationMs={0}
        {...handlers}
      />,
    );
    openPanel();
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue("00");
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("00");
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "開始" })).toBeDisabled();
  });

  it("分は99、秒は59を上限に入力値を正規化する", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        {...handlers}
      />,
    );
    openPanel();
    fireEvent.change(screen.getByLabelText("タイマー時間（分）"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("タイマー時間（秒）"), {
      target: { value: "60" },
    });
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue("99");
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("59");
  });

  it("編集中は空文字を許容し、00:00 は開始不可のまま blur で 00 に正規化する", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        initialDurationMs={0}
        {...handlers}
      />,
    );
    openPanel();
    const minutes = screen.getByLabelText("タイマー時間（分）");
    const seconds = screen.getByLabelText("タイマー時間（秒）");

    fireEvent.change(minutes, { target: { value: "" } });
    fireEvent.change(seconds, { target: { value: "" } });
    expect(minutes).toHaveValue("");
    expect(seconds).toHaveValue("");
    expect(minutes).toHaveAttribute("placeholder", "00");
    expect(seconds).toHaveAttribute("placeholder", "00");
    expect(minutes).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "開始" })).toBeDisabled();

    fireEvent.blur(minutes);
    fireEvent.blur(seconds);
    expect(minutes).toHaveValue("00");
    expect(seconds).toHaveValue("00");
  });

  it("1桁の入力は編集中そのまま保ち、blur でゼロ埋めする", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        {...handlers}
      />,
    );
    openPanel();
    const minutes = screen.getByLabelText("タイマー時間（分）");
    fireEvent.change(minutes, { target: { value: "5" } });
    expect(minutes).toHaveValue("5");
    fireEvent.blur(minutes);
    expect(minutes).toHaveValue("05");
  });

  it("±1分は空の入力を 0 として調整する", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        initialDurationMs={0}
        {...handlers}
      />,
    );
    openPanel();
    const minutes = screen.getByLabelText("タイマー時間（分）");
    const seconds = screen.getByLabelText("タイマー時間（秒）");
    fireEvent.change(minutes, { target: { value: "" } });
    fireEvent.change(seconds, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "+1分" }));
    expect(minutes).toHaveValue("01");
    expect(seconds).toHaveValue("00");
    fireEvent.change(minutes, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "-1分" }));
    expect(minutes).toHaveValue("00");
    expect(seconds).toHaveValue("00");
  });

  it("ホストは分・秒の自由入力から開始できる", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        {...handlers}
      />,
    );

    openPanel();

    fireEvent.change(screen.getByLabelText("タイマー時間（分）"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("タイマー時間（秒）"), {
      target: { value: "30" },
    });
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue("1");
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("30");
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    expect(handlers.onStart).toHaveBeenCalledWith(90_000);
  });

  it("-1分は 00:00 を下限にクランプする", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        initialDurationMs={60_000}
        {...handlers}
      />,
    );
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "-1分" }));
    fireEvent.click(screen.getByRole("button", { name: "-1分" }));
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue("00");
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("00");
  });

  it("+1分は自由入力と同じ 99:59 を上限にクランプする", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        initialDurationMs={98 * 60_000 + 30_000}
        {...handlers}
      />,
    );
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "+1分" }));
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue("99");
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("30");
    fireEvent.click(screen.getByRole("button", { name: "+1分" }));
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue("99");
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("59");
  });

  it("+1分は上限付近の自由入力値（99:59）を減少させない", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost
        disabled={false}
        {...handlers}
      />,
    );
    openPanel();
    fireEvent.change(screen.getByLabelText("タイマー時間（分）"), {
      target: { value: "99" },
    });
    fireEvent.change(screen.getByLabelText("タイマー時間（秒）"), {
      target: { value: "59" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+1分" }));
    expect(screen.getByLabelText("タイマー時間（分）")).toHaveValue("99");
    expect(screen.getByLabelText("タイマー時間（秒）")).toHaveValue("59");
  });

  it("非ホストは状態だけを表示し操作UIを出さない", () => {
    render(
      <RoomTimer
        timer={buildPausedTimer({ remainingMs: 30_000, durationMs: 60_000 })}
        serverOffsetMs={0}
        isHost={false}
        disabled={false}
        {...handlers}
      />,
    );

    const chip = screen.getByTestId("room-timer");
    expect(screen.getByRole("timer")).toHaveTextContent("00:30");
    expect(chip.tagName).toBe("SPAN");
    expect(chip).not.toHaveClass("disabled:opacity-50");
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "タイマー 一時停止中 00:30",
    );
    fireEvent.click(chip);
    expect(screen.queryByTestId("room-timer-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("タイマー時間（分）"),
    ).not.toBeInTheDocument();
  });

  it("非ホストの未設定状態はタイマーカード自体を表示しない", () => {
    render(
      <RoomTimer
        timer={{ status: "idle" }}
        serverOffsetMs={0}
        isHost={false}
        disabled={false}
        {...handlers}
      />,
    );
    expect(screen.queryByTestId("room-timer")).not.toBeInTheDocument();
  });

  it("実行中は補正済みサーバー時刻を基準に減り、ホスト操作を送る", () => {
    const now = Date.now();
    render(
      <RoomTimer
        timer={buildRunningTimer({ now, remainingMs: 65_000 })}
        serverOffsetMs={5_000}
        isHost
        disabled={false}
        {...handlers}
      />,
    );

    expect(screen.getByRole("timer")).toHaveTextContent("01:00");
    expect(screen.getByTestId("room-timer")).toHaveClass("h-10", "w-28");
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "一時停止" }));
    fireEvent.click(screen.getByRole("button", { name: "+1分" }));
    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(handlers.onPause).toHaveBeenCalledOnce();
    expect(handlers.onExtend).toHaveBeenCalledOnce();
    expect(handlers.onStop).toHaveBeenCalledOnce();
  });

  it("一時停止中は再開できる", () => {
    render(
      <RoomTimer
        timer={buildPausedTimer({ remainingMs: 42_000, durationMs: 60_000 })}
        serverOffsetMs={0}
        isHost
        disabled={false}
        {...handlers}
      />,
    );
    expect(screen.getByTestId("room-timer")).toHaveAttribute(
      "data-status",
      "paused",
    );
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "再開" }));
    expect(handlers.onResume).toHaveBeenCalledOnce();
  });

  it("00:00 到達時は音を出さず視覚通知する", () => {
    render(
      <RoomTimer
        timer={buildEndedTimer({ now: Date.now() })}
        serverOffsetMs={0}
        isHost={false}
        disabled={false}
        {...handlers}
      />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
    expect(screen.getByRole("timer")).not.toHaveAttribute("aria-live");
    expect(screen.getByText("タイマーが終了しました。")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByTestId("room-timer")).toHaveAttribute(
      "data-ended",
      "true",
    );
  });

  it("時間経過で表示が減り、00:00 到達時に ended になって interval を止める", () => {
    render(
      <RoomTimer
        timer={buildRunningTimer({
          now: Date.now(),
          remainingMs: 60_000,
        })}
        serverOffsetMs={0}
        isHost={false}
        disabled={false}
        {...handlers}
      />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("01:00");

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:59");

    act(() => vi.advanceTimersByTime(59_000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
    expect(screen.getByTestId("room-timer")).toHaveAttribute(
      "data-ended",
      "true",
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
