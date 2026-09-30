import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimerSoundControl } from "./timer-sound-control";

describe("TimerSoundControl", () => {
  it("音声が無効のとき、アイコンを押すと有効化する", () => {
    const onEnable = vi.fn(async () => undefined);
    render(
      <TimerSoundControl
        enabled={false}
        playbackBlocked={false}
        onEnable={onEnable}
        onMute={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: "タイマー通知音" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveClass(
      "transition-none",
      "active:not-aria-[haspopup]:-translate-y-1/2",
    );
    expect(
      screen.queryByRole("button", { name: "試聴" }),
    ).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it("音声が有効のとき、アイコンを押すと消音する", () => {
    const onMute = vi.fn();
    render(
      <TimerSoundControl
        enabled
        playbackBlocked={false}
        onEnable={vi.fn(async () => undefined)}
        onMute={onMute}
      />,
    );

    const toggle = screen.getByRole("button", { name: "タイマー通知音" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(onMute).toHaveBeenCalledOnce();
  });

  it("再生拒否を画面と読み上げで伝え、同じアイコンから再試行する", () => {
    const onEnable = vi.fn(async () => undefined);
    const { rerender } = render(
      <TimerSoundControl
        enabled={false}
        playbackBlocked
        onEnable={onEnable}
        onMute={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: "タイマー通知音" });
    expect(screen.getByRole("status")).toHaveTextContent("再生できません");
    expect(toggle).toHaveAccessibleDescription(/再試行/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onEnable).toHaveBeenCalledOnce();

    rerender(
      <TimerSoundControl
        enabled
        playbackBlocked={false}
        onEnable={onEnable}
        onMute={vi.fn()}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });
});
