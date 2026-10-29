import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomTimer } from "./room-timer";
import {
  buildEndedTimer,
  buildPausedTimer,
  buildRunningTimer,
  ROOM_TIMER_FIXTURE_NOW,
} from "./room-timer.fixture";

function props() {
  return {
    timer: buildRunningTimer(),
    serverOffsetMs: 0,
    now: () => ROOM_TIMER_FIXTURE_NOW,
    disabled: false,
    initialDurationMs: 300_000,
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onExtend: vi.fn(),
    onNext: vi.fn(),
  };
}

describe("RoomTimer", () => {
  it("延長終了後の自動進行は工程の必須条件が揃ってからと案内する", () => {
    render(<RoomTimer {...props()} timer={buildEndedTimer()} />);
    expect(screen.getByText(/進行条件が揃うと/)).toBeInTheDocument();
    expect(screen.queryByText(/次へ進めます/)).not.toBeInTheDocument();
  });
  it("時間切れに1分延長を選べ、稼働中の円では一時停止しない", () => {
    const p = { ...props(), onExtend: vi.fn() };
    const { rerender } = render(<RoomTimer {...p} />);
    fireEvent.click(screen.getByTestId("room-timer"));
    expect(p.onPause).not.toHaveBeenCalled();
    rerender(<RoomTimer {...p} timer={buildEndedTimer()} />);
    const extend = screen.getByRole("button", { name: "＋1分" });
    expect(extend.querySelector("svg")).toBeNull();
    fireEvent.click(extend);
    expect(p.onExtend).toHaveBeenCalledOnce();
  });
  it("サーバーとの時刻差を残り時間へ反映する", () => {
    render(
      <RoomTimer
        {...props()}
        timer={buildRunningTimer({ remainingMs: 150_000, durationMs: 300_000 })}
        serverOffsetMs={30_000}
      />,
    );
    expect(screen.getByRole("timer")).toHaveAccessibleName(/02:00/);
  });
  it("時間切れでは選択肢を表示するが次へ自動で進まない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(ROOM_TIMER_FIXTURE_NOW);
    try {
      const p = props();
      render(
        <RoomTimer
          {...p}
          now={Date.now}
          timer={buildRunningTimer({ remainingMs: 500 })}
        />,
      );
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByRole("button", { name: "＋1分" })).toBeInTheDocument();
      expect(p.onNext).not.toHaveBeenCalled();
      expect(p.onStart).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it("時間切れの延長には波紋を出さず、付箋の入力フォーカスを保つ", () => {
    vi.useFakeTimers();
    vi.setSystemTime(ROOM_TIMER_FIXTURE_NOW);
    try {
      const p = props();
      const view = (timer = buildRunningTimer({ remainingMs: 500 })) => (
        <>
          <input aria-label="付箋の本文" />
          <RoomTimer {...p} timer={timer} now={Date.now} />
        </>
      );
      const { rerender } = render(view());
      const input = screen.getByRole("textbox");
      input.focus();
      const floating = screen.getByTestId("timer-floating");
      expect(floating).toHaveAttribute("data-timer-attention", "none");
      act(() => vi.advanceTimersByTime(600));
      expect(floating).toHaveAttribute("data-timer-attention", "none");
      expect(input).toHaveFocus();
      expect(p.onNext).not.toHaveBeenCalled();
      fireEvent.pointerDown(screen.getByRole("button", { name: "＋1分" }));
      expect(floating).toHaveAttribute("data-timer-attention", "none");
      rerender(view(buildEndedTimer()));
      expect(floating).toHaveAttribute("data-timer-attention", "none");
    } finally {
      vi.useRealTimers();
    }
  });
  it("共有の一巡で選択肢に注意を促し、操作を始めると合図を消す", () => {
    const p = props();
    const { rerender } = render(<RoomTimer {...p} timer={buildEndedTimer()} />);
    rerender(
      <RoomTimer
        {...p}
        timer={{ status: "idle" }}
        sharingComplete
        onRestartWriting={vi.fn()}
      />,
    );
    const floating = screen.getByTestId("timer-floating");
    expect(floating).toHaveAttribute("data-timer-attention", "pulse");
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "付箋を書き足す" }),
    );
    expect(floating).toHaveAttribute("data-timer-attention", "none");
  });
  it("終了状態の復元でも延長ボタンに合図を出さない", () => {
    const p = props();
    render(<RoomTimer {...p} timer={buildEndedTimer()} />);
    const floating = screen.getByTestId("timer-floating");
    expect(floating).toHaveAttribute("data-timer-attention", "none");
    act(() => screen.getByRole("button", { name: "＋1分" }).focus());
    expect(floating).toHaveAttribute("data-timer-attention", "none");
  });
  it("一時停止から再開したタイマーが終了しても延長に波紋を出さない", () => {
    const p = props();
    const { rerender } = render(<RoomTimer {...p} />);
    const floating = screen.getByTestId("timer-floating");
    rerender(<RoomTimer {...p} timer={buildPausedTimer()} />);
    expect(floating).toHaveAttribute("data-timer-attention", "none");
    rerender(<RoomTimer {...p} />);
    rerender(<RoomTimer {...p} timer={buildEndedTimer()} />);
    expect(floating).toHaveAttribute("data-timer-attention", "none");
  });
  it("切断中は合図を消し、再接続では波紋を繰り返さない", () => {
    const p = props();
    const { rerender } = render(<RoomTimer {...p} />);
    const floating = screen.getByTestId("timer-floating");
    rerender(<RoomTimer {...p} timer={buildEndedTimer()} />);
    expect(floating).toHaveAttribute("data-timer-attention", "none");
    rerender(<RoomTimer {...p} timer={buildEndedTimer()} disabled />);
    expect(floating).toHaveAttribute("data-timer-attention", "none");
    rerender(<RoomTimer {...p} timer={buildEndedTimer()} />);
    expect(floating).toHaveAttribute("data-timer-attention", "none");
  });
  it("切断・送信中は延長を実行しない", () => {
    const p = props();
    render(<RoomTimer {...p} timer={buildEndedTimer()} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "＋1分" }));
    expect(p.onStart).not.toHaveBeenCalled();
    expect(p.onNext).not.toHaveBeenCalled();
    expect(p.onExtend).not.toHaveBeenCalled();
  });
  it("1分延長後の時間切れでは空の円を残さずタイマーを隠す", () => {
    const p = props();
    render(
      <RoomTimer
        {...p}
        timer={{ status: "ended", durationMs: 60_000, extensionUsed: true }}
      />,
    );
    expect(screen.queryByRole("button", { name: "＋1分" })).toBeNull();
    expect(screen.getByTestId("timer-floating")).not.toBeVisible();
  });
  it("ホバーや円を押しても計時を止めない", () => {
    const p = props();
    render(<RoomTimer {...p} />);
    const circle = screen.getByTestId("room-timer");
    fireEvent.mouseEnter(circle);
    expect(p.onPause).not.toHaveBeenCalled();
    expect(circle).toHaveAccessibleName(/ドラッグして移動/);
    fireEvent.click(circle);
    expect(p.onPause).not.toHaveBeenCalled();
  });
  it("以前の一時停止状態は残り時間から再開できる", () => {
    const p = props();
    render(<RoomTimer {...p} timer={buildPausedTimer()} />);
    expect(screen.getByRole("timer")).toHaveTextContent("02:30");
    expect(screen.queryByRole("button", { name: "＋1分" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "再開" }));
    expect(p.onResume).toHaveBeenCalledOnce();
    expect(p.onStart).not.toHaveBeenCalled();
  });
  it("停止中のEscapeは残り時間を保って円へ畳み、再クリックで選択肢を開く", () => {
    const p = props();
    render(<RoomTimer {...p} timer={buildPausedTimer()} />);
    fireEvent.keyDown(screen.getByTestId("timer-floating"), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "再開" })).toBeNull();
    fireEvent.click(screen.getByTestId("room-timer"));
    expect(screen.getByRole("button", { name: "再開" })).toBeVisible();
    expect(p.onResume).not.toHaveBeenCalled();
    expect(screen.getByRole("timer")).toHaveTextContent("02:30");
  });
  it("以前の一時停止状態を再開した際は円へフォーカスを引き継ぐ", () => {
    const p = props();
    const { rerender } = render(
      <RoomTimer {...p} timer={buildPausedTimer()} />,
    );
    const resume = screen.getByRole("button", { name: "再開" });
    resume.focus();
    fireEvent.click(resume);
    rerender(<RoomTimer {...p} />);
    expect(screen.getByTestId("room-timer")).toHaveFocus();
  });
  it("他の参加者による停止・再開では入力中のフォーカスを奪わない", () => {
    const p = props();
    const view = (timer = p.timer) => (
      <>
        <input aria-label="付箋の本文" />
        <RoomTimer {...p} timer={timer} />
      </>
    );
    const { rerender } = render(view());
    const input = screen.getByRole("textbox");
    input.focus();
    rerender(view(buildPausedTimer()));
    expect(input).toHaveFocus();
    rerender(view());
    expect(input).toHaveFocus();
  });
  it("以前の一時停止状態でも切断中は再開できない", () => {
    const p = props();
    const { rerender } = render(
      <RoomTimer {...p} timer={buildPausedTimer()} />,
    );
    expect(screen.getByRole("button", { name: "再開" })).toBeEnabled();
    rerender(<RoomTimer {...p} timer={buildPausedTimer()} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "再開" }));
    expect(p.onResume).not.toHaveBeenCalled();
  });
  it("Escapeで楕円を畳み、円を押すと開き直せる", () => {
    render(<RoomTimer {...props()} timer={buildEndedTimer()} />);
    fireEvent.keyDown(screen.getByTestId("timer-floating"), { key: "Escape" });
    expect(
      screen.queryByRole("button", { name: "＋1分" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("room-timer"));
    expect(screen.getByRole("button", { name: "＋1分" })).toBeInTheDocument();
  });
});
