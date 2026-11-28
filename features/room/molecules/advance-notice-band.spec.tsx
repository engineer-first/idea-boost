import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdvanceNoticeBand } from "./advance-notice-band";

const NOW = 1_000_000;

function setup(
  overrides: Partial<Parameters<typeof AdvanceNoticeBand>[0]> = {},
) {
  const props = {
    cause: "member" as const,
    initiatorName: "あおい",
    phase: { kind: "step", phase: 1, step: 1 } as const,
    endsAt: NOW + 5000,
    durationMs: 5000,
    serverOffsetMs: 0,
    stop: { kind: "hold" as const, onStop: vi.fn() },
    ...overrides,
  };
  render(<AdvanceNoticeBand {...props} />);
  return props;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("AdvanceNoticeBand", () => {
  it("押した人・次のステップ・そこでやること・いまの目安を、1つの status にまとめて出す", () => {
    setup();
    const band = screen.getByRole("status", { name: "次のステップへ進む予告" });
    expect(band).toHaveTextContent("あおいさんが進めます");
    expect(band).toHaveTextContent("1-2 共有");
    expect(band).toHaveTextContent("付箋を順番に出して、ひとことずつ話す");
    expect(band).toHaveTextContent("いまは、話せる付箋が1枚あれば大丈夫");
  });

  it.each([
    ["self", "あなたが進めます", "やめる", "withdraw"],
    ["votes", "全員の投票がそろいました", "まって！", "hold"],
    ["timer", "時間になりました", "＋1分", "extend"],
  ] as const)(
    "きっかけが %s のときは「%s」と出し、止めるボタンは「%s」にする",
    (cause, who, label, kind) => {
      const props = setup({
        cause,
        initiatorName: undefined,
        stop: { kind, onStop: vi.fn() },
      });
      expect(screen.getByRole("status")).toHaveTextContent(who);
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(props.stop?.onStop).toHaveBeenCalledOnce();
    },
  );

  it("フェーズの最後のステップでは、次のフェーズの最初のステップを次として出す", () => {
    setup({ phase: { kind: "step", phase: 1, step: 5 } });
    expect(screen.getByRole("status")).toHaveTextContent("2-1 個人");
  });

  it("残り秒は終了時刻とサーバー時刻の差から出し、時間とともに減らす", () => {
    // 手元の時計がサーバーより2秒進んでいる。
    setup({ endsAt: NOW + 3000, serverOffsetMs: -2000 });
    expect(screen.getByTestId("advance-notice-seconds")).toHaveTextContent("5");
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByTestId("advance-notice-seconds")).toHaveTextContent("3");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId("advance-notice-seconds")).toHaveTextContent("0");
  });

  it("残り秒は読み上げの対象にしない", () => {
    setup();
    expect(screen.getByTestId("advance-notice-seconds")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("延長を使った後の時間切れでは、止めるボタンの代わりにこのまま進むことを伝える", () => {
    setup({ cause: "timer", initiatorName: undefined, stop: null });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "延長は使いました。このまま進みます。",
    );
  });

  it("止める操作を受け付けられない間は、止めるボタンを押せなくする", () => {
    const props = setup({
      stop: { kind: "hold", onStop: vi.fn(), disabled: true },
    });
    const button = screen.getByRole("button", { name: "まって！" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(props.stop?.onStop).not.toHaveBeenCalled();
  });
});
