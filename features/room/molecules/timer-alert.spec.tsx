import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimerAlert } from "./timer-alert";

describe("タイマーの画面中央の通知", () => {
  it("通知の間だけ中央に出して読み上げ、操作は下の付箋へ通す", () => {
    const { rerender } = render(<TimerAlert kind={null} />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    expect(screen.queryByTestId("timer-alert")).not.toBeInTheDocument();

    rerender(<TimerAlert kind="oneMinute" />);
    expect(status).toHaveTextContent("あと1分！");
    expect(screen.getByTestId("timer-alert")).toHaveClass(
      "pointer-events-none",
    );

    rerender(<TimerAlert kind="timeUp" />);
    expect(status).toHaveTextContent("時間になりました！");

    rerender(<TimerAlert kind={null} />);
    expect(screen.queryByTestId("timer-alert")).not.toBeInTheDocument();
    expect(status).toBeEmptyDOMElement();
  });
});
