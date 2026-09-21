import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimerSoundControl } from "./timer-sound-control";

function openSettings(props: {
  enabled: boolean;
  playbackBlocked: boolean;
  onEnable: () => Promise<void>;
  onMute: () => void;
  onPreview: () => Promise<void>;
}) {
  render(<TimerSoundControl {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "通知音の設定" }));
}

describe("TimerSoundControl", () => {
  it("未有効のとき、端末限定の説明と有効化・試聴の入口を表示する", () => {
    const onEnable = vi.fn(async () => undefined);
    openSettings({
      enabled: false,
      playbackBlocked: false,
      onEnable,
      onMute: vi.fn(),
      onPreview: vi.fn(async () => undefined),
    });

    expect(screen.getByText(/全員の投票完了/)).toBeInTheDocument();
    expect(screen.getByText("この端末のみ")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "通知音を有効にする" }));
    expect(onEnable).toHaveBeenCalledOnce();
  });

  it("有効時は試聴と消音を本人が操作できる", () => {
    const onMute = vi.fn();
    const onPreview = vi.fn(async () => undefined);
    openSettings({
      enabled: true,
      playbackBlocked: false,
      onEnable: vi.fn(async () => undefined),
      onMute,
      onPreview,
    });

    fireEvent.click(screen.getByRole("button", { name: "試聴" }));
    fireEvent.click(screen.getByRole("button", { name: "通知音を消音" }));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onMute).toHaveBeenCalledOnce();
  });

  it("再生拒否時は使える状態と見せず、再試行とブラウザ設定の案内を表示する", () => {
    const onEnable = vi.fn(async () => undefined);
    openSettings({
      enabled: false,
      playbackBlocked: true,
      onEnable,
      onMute: vi.fn(),
      onPreview: vi.fn(async () => undefined),
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "ブラウザが音声の再生を拒否しました。",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "再試行して有効にする" }),
    );
    expect(onEnable).toHaveBeenCalledOnce();
  });
});
