import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { PhaseOneWritingTour } from "./phase-one-writing-tour";

const driverMock = vi.hoisted(() => vi.fn());

vi.mock("driver.js", () => ({ driver: driverMock }));

describe("PhaseOneWritingTour", () => {
  beforeEach(() => {
    driverMock.mockClear();
    driverMock.mockReturnValue({ drive: vi.fn(), destroy: vi.fn() });
    vi.stubGlobal("innerWidth", 1280);
  });

  it("フェーズ1-1ではDriver.jsを起動し、通常の操作説明を表示する", () => {
    render(
      <>
        <button type="button" aria-label="付箋を追加" />
        <PhaseOneWritingTour phase={buildPhaseStep(1, 1)} />
      </>,
    );

    expect(screen.getByTestId("phase-one-writing-tour")).toBeInTheDocument();
    expect(driverMock).toHaveBeenCalledOnce();
    const config = driverMock.mock.calls[0]?.[0];
    expect(config.steps[0].popover.description).toBe(
      "このボタンで付箋を追加します。",
    );
    expect(config.steps[1].popover.description).toBe(
      "最近困ったことを書き出しましょう。",
    );
    expect(config.steps[0].popover.showButtons).toEqual(["next"]);
    expect(config.steps[1].popover.showButtons).toEqual(["next"]);
    expect(config.steps[0].disableActiveInteraction).toBe(true);
    expect(config.nextBtnText).toBe("次へ");
    expect(config.doneBtnText).toBe("終了");
  });

  it("フェーズ1-1以外では表示しない", () => {
    render(<PhaseOneWritingTour phase={buildPhaseStep(1, 2)} />);

    expect(
      screen.queryByTestId("phase-one-writing-tour"),
    ).not.toBeInTheDocument();
    expect(driverMock).not.toHaveBeenCalled();
  });

  it("フェーズ1-2では共有キャンバスへの移動を案内する", () => {
    render(
      <>
        <button type="button" aria-label="付箋を追加" />
        <div data-testid="private-notes-toolbar" />
        <button type="button" aria-label="発表者と全体の順番を確認" />
        <div role="application" aria-label="共有キャンバス" />
        <PhaseOneWritingTour phase={buildPhaseStep(2, 1)} />
      </>,
    );

    const config = driverMock.mock.calls[0]?.[0];
    expect(config.steps[0].popover.description).toBe(
      "ここに自分の名前が表示されたら、付箋を共有して発表しましょう。",
    );
    expect(config.steps[1].popover.description).toBe(
      "付箋をボードにドラッグして共有します。",
    );
    expect(config.steps[2].popover.description).toBe(
      "ここにドラッグするとメンバーに共有されます。",
    );
    expect(config.steps[2].popover.side).toBe("right");
  });
});
