import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FacilitationGuideContent } from "../logic/facilitation-guide";
import { FacilitationGuide } from "./facilitation-guide";

const GUIDE: FacilitationGuideContent = {
  durationMinutes: 3,
  message: "最近あった困ったことを付箋に書き出そう。",
  hostMessage: "タイマーが終了したら、次のステップへ進んでください。",
};

describe("FacilitationGuide", () => {
  it("展開中は所要時間と参加者向けガイドをライブ領域に表示する", () => {
    render(
      <FacilitationGuide id="guide" guide={GUIDE} isHost={false} isExpanded />,
    );

    const guide = screen.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    expect(guide).toHaveAttribute("id", "guide");
    expect(guide).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("3分")).toBeInTheDocument();
    expect(screen.getByText(GUIDE.message)).toBeInTheDocument();
  });

  it("ホストだけに進行指示を表示する", () => {
    const { rerender } = render(
      <FacilitationGuide id="guide" guide={GUIDE} isHost={false} isExpanded />,
    );

    expect(screen.queryByText("進行役へ")).not.toBeInTheDocument();
    expect(screen.queryByText(GUIDE.hostMessage ?? "")).not.toBeInTheDocument();

    rerender(<FacilitationGuide id="guide" guide={GUIDE} isHost isExpanded />);

    expect(screen.getByText("進行役へ")).toBeInTheDocument();
    expect(screen.getByText(GUIDE.hostMessage ?? "")).toBeInTheDocument();
  });

  it("折り畳み中は支援技術とポインター操作から隠す", () => {
    render(
      <FacilitationGuide id="guide" guide={GUIDE} isHost isExpanded={false} />,
    );

    expect(screen.getByTestId("facilitation-guide-shell")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByTestId("facilitation-guide-shell")).toHaveClass(
      "pointer-events-none",
      "grid-rows-[0fr]",
      "scale-[0.98]",
    );
  });
});
