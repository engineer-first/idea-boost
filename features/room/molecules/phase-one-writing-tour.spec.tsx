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

  it("フェーズ1-3では付箋の接近、枠、命名を案内する", () => {
    render(<PhaseOneWritingTour phase={buildPhaseStep(3, 1)} />);

    expect(screen.getAllByTestId("phase-one-group-note")).toHaveLength(3);
    expect(
      screen.getByText("会議で意見があっても言い出せない", { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("phase-one-group-outline"),
    ).not.toBeInTheDocument();
    const config = driverMock.mock.calls[0]?.[0];
    expect(config.steps[0].popover.description).toBe(
      "似ている付箋を近づけて、まとめましょう。",
    );
    expect(config.steps[1].popover.description).toBe(
      "近づけると、グループの枠ができます。",
    );
    expect(config.steps[2].popover.description).toBe(
      "グループ名を入力して、まとまりに名前を付けましょう。",
    );
  });

  it("フェーズ1-4ではシールの選択と投票を案内する", () => {
    render(
      <>
        <section data-vote-palette="true" aria-label="投票パレット">
          <button type="button" aria-label="主観シール 残り1票" />
          <button type="button" aria-label="客観シール 残り3票" />
        </section>
        <PhaseOneWritingTour phase={buildPhaseStep(4, 1)} />
      </>,
    );

    expect(screen.getByTestId("phase-one-writing-tour")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-vote-note]")).toHaveLength(2);
    expect(driverMock).toHaveBeenCalledOnce();
    const config = driverMock.mock.calls[0]?.[0];
    expect(config.steps).toHaveLength(3);
    expect(config.steps[2].element).toBe("body");
    expect(config.steps[0].popover.description).toBe(
      "主観は1票。激しく共感する、取り組みたい付箋に貼りましょう。",
    );
    expect(config.steps[1].popover.description).toBe(
      "客観は3票。自分以外の人にも価値がありそうな付箋に貼りましょう。",
    );
    expect(config.steps[2].popover.description).toBe(
      "2枚の付箋へシールをドラッグして投票します。投票中は、自分のシールだけが見えます。",
    );
  });

  it("フェーズ1-5のホストには結果、採用、確定、進行を案内する", () => {
    render(
      <>
        <div data-testid="phase-loop-hud">
          <button type="button">採用する付箋を選ぶ</button>
        </div>
        <button type="button">次のステップへ</button>
        <PhaseOneWritingTour phase={buildPhaseStep(5, 1)} isHost />
      </>,
    );

    expect(screen.getByTestId("phase-one-writing-tour")).toBeInTheDocument();
    expect(
      screen.getByTestId("phase-one-decision-demo-note"),
    ).toBeInTheDocument();
    const config = driverMock.mock.calls[0]?.[0];
    expect(config.steps).toHaveLength(4);
    expect(config.animate).toBe(false);
    expect(config.steps[0].popover.description).toBe(
      "みんなの投票結果を参考に、取り組む課題を1つ話し合いましょう。",
    );
    expect(config.steps[1].popover.description).toBe(
      "課題が決まったら、このボタンで採用する付箋の選択を始めます。",
    );
    expect(config.steps[2].popover.description).toBe(
      "取り組む課題の付箋をクリックすると、確定します。",
    );
    expect(config.steps[3].popover.description).toBe(
      "確定した課題は全員に表示されます。次へ進む前なら、取り消して選び直せます。",
    );
  });

  it("フェーズ1-5の参加者には結果と確定内容だけを案内する", () => {
    render(<PhaseOneWritingTour phase={buildPhaseStep(5, 1)} isHost={false} />);

    expect(
      screen.getByTestId("phase-one-decision-demo-note"),
    ).toBeInTheDocument();
    const config = driverMock.mock.calls[0]?.[0];
    expect(config.steps).toHaveLength(3);
    expect(config.steps[0].popover.description).toBe(
      "投票結果を参考に、取り組む課題をみんなで話し合いましょう。",
    );
    expect(config.steps[1].popover.description).toBe(
      "話し合って決めた課題は、ホストが確定します。",
    );
    expect(config.steps[2].popover.description).toBe(
      "確定した課題はここに表示されます。次は、この課題から問いを考えます。",
    );
  });
});
