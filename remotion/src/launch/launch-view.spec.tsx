import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LaunchView } from "./launch-view";

describe("Launch Video の実UI", () => {
  it("個人作業では非公開の意味と進むタイマーを見せる", () => {
    const { rerender } = render(<LaunchView frame={960} />);
    expect(screen.getByText("自分にだけ見える")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("02:59");
    rerender(<LaunchView frame={1020} />);
    expect(screen.getByRole("timer")).toHaveTextContent("02:58");
  });
  it("ステルス投票中は集計を描画せず、開票して初めて結果を表示する", () => {
    const { rerender } = render(<LaunchView frame={1950} />);
    expect(screen.getByText("投票中は、自分の票だけ。")).toBeInTheDocument();
    expect(screen.queryByTestId("vote-result-ranking")).not.toBeInTheDocument();
    expect(screen.queryByText("Yuki")).not.toBeInTheDocument();
    rerender(<LaunchView frame={2020} />);
    expect(screen.getByTestId("vote-result-ranking")).toBeInTheDocument();
    expect(screen.queryByText("採用アイデア")).not.toBeInTheDocument();
  });
  it("実際の決定ボタンを経て採用カードが登場する", () => {
    const { rerender } = render(<LaunchView frame={2110} />);
    expect(
      screen.getAllByRole("button", { name: /決定/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("採用アイデア")).not.toBeInTheDocument();
    rerender(<LaunchView frame={2230} />);
    expect(screen.getByText("採用アイデア")).toBeInTheDocument();
    expect(screen.getByText(/スプリント完了/)).toBeInTheDocument();
  });
});
