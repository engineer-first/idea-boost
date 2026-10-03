import { describe, expect, it } from "vitest";
import { buildLobbyPhase, buildPhaseStep } from "@/contracts/phase.fixture";
import { getFacilitationGuide } from "./facilitation-guide";

describe("getFacilitationGuide", () => {
  it("グループ化では目的と、枠に名前を付ける操作を示す", () => {
    const guide = getFacilitationGuide(buildPhaseStep(3, 1));
    expect(guide?.firstAction).toContain("2枚");
    expect(guide?.purpose).toContain("投票で比べやすく");
    expect(guide?.purpose).toContain("そのままで大丈夫");
    expect(guide?.steps?.join(" ")).toContain("名前を押す");
    expect(guide?.visualExample?.grouped).toBe(true);
  });

  it("問いの作成は元の課題から質問へ変える例と型を示す", () => {
    const guide = getFacilitationGuide(buildPhaseStep(1, 2));
    expect(guide?.firstAction).toContain("決定した課題");
    expect(guide?.visualExample?.flow).toBe(true);
    expect(guide?.steps?.join(" ")).toContain("どうすれば私たちは");
  });

  it.each([
    buildPhaseStep(4),
    buildPhaseStep(3, 2),
    buildPhaseStep(4, 3),
  ])("%o は個々の付箋と共通の投票基準を案内する", (phase) => {
    expect(getFacilitationGuide(phase)).toMatchObject({
      message:
        "主観1票・客観3票を使い、現在のフェーズの個々の付箋へ投票します。",
      steps: [
        ...(phase.kind === "step" && phase.phase === 3
          ? ["上ほど価値が高く、右ほど実現しやすいことを確認する"]
          : []),
        "投票対象は現在のフェーズの個々の付箋です。",
        "主観は「激しく共感する、取り組みたい」。",
        "客観は「自分以外の人にも価値がありそう」。",
        "主観1票・客観3票を、シールをドラッグするか選択して投票対象の付箋へ貼ります。",
        "貼ったシールを押すと、投票を1票取り消せます。",
      ],
    });
  });

  it("問いの決定ステップには投票基準を表示しない", () => {
    const guide = getFacilitationGuide(buildPhaseStep(4, 2));

    expect(guide?.steps).not.toContain(
      "主観は「激しく共感する、取り組みたい」。",
    );
    expect(guide?.steps).not.toContain(
      "客観は「自分以外の人にも価値がありそう」。",
    );
  });

  // 文言全体の複製を避け、所要時間と表示内容の要件を個別に守る。
  it.each([
    [1, 1, 5],
    [1, 2, 6],
    [1, 3, 4],
    [1, 4, 3],
    [1, 5, 10],
    [2, 1, 3],
    [2, 2, 6],
    [2, 3, 4],
    [2, 4, 10],
    [3, 1, 5],
    [3, 2, 6],
    [3, 3, 7],
    [3, 4, 3],
    [3, 5, 10],
  ] as const)("%i-%i の所要時間を維持する", (phase, step, durationMinutes) => {
    expect(
      getFacilitationGuide(buildPhaseStep(step, phase))?.durationMinutes,
    ).toBe(durationMinutes);
  });

  it.each([
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 1],
    [3, 3],
  ] as const)("%i-%i に短い作業・最初の操作・静的な例・目的を用意する", (phase, step) => {
    const guide = getFacilitationGuide(buildPhaseStep(step, phase));
    expect(guide?.action?.length).toBeLessThanOrEqual(14);
    expect(guide?.firstAction).toBeTruthy();
    expect(guide?.visualExample?.items.length).toBeGreaterThanOrEqual(2);
    expect(guide?.purpose).toBeTruthy();
    expect(guide?.hostTimerGuide).toContain("画面上");
  });

  it("個人ワークはホストへタイマーの場所と開始操作を示す", () => {
    const guide = getFacilitationGuide(buildPhaseStep(1));
    expect(guide?.hostTimerGuide).toContain("時間表示を押す");
    expect(guide?.hostTimerGuide).toContain("分・秒");
    expect(guide?.hostTimerGuide).toContain("「開始」");
  });

  it.each([
    [buildPhaseStep(2), "全員の共有"],
    [buildPhaseStep(4), "全員の投票"],
    [buildPhaseStep(5), "ホストが採用する付箋を確定"],
    [buildPhaseStep(3, 3), "全員が納得できる位置"],
    [buildPhaseStep(5, 3), "成果を確認"],
  ] as const)("%oの詳細には実際の次へ進む目安を含める", (phase, criterion) => {
    expect(getFacilitationGuide(phase)?.completion).toContain(criterion);
  });
  it("ロビーではガイドを返さない", () => {
    expect(getFacilitationGuide(buildLobbyPhase())).toBeNull();
  });

  it.each([
    [buildPhaseStep(5, 1), "付箋"],
    [buildPhaseStep(4, 2), "問い"],
    [buildPhaseStep(5, 3), "解決策"],
  ] as const)("%o はホストが画面下から1件を確定する手順を案内する", (phase, target) => {
    const guide = getFacilitationGuide(phase);
    expect(guide?.steps?.join(" ")).toContain("画面下");
    expect(guide?.steps?.join(" ")).toContain(target);
    expect(guide?.steps?.join(" ")).toContain("1件");
  });
});

it.each([
  1, 2, 3,
] as const)("フェーズ%iの共有は本人・ホストの交代と自由な共有を案内する", (phase) => {
  const guide = getFacilitationGuide(buildPhaseStep(2, phase));
  expect(guide?.firstAction).toContain("画面上");
  expect(guide?.steps?.join(" ")).toContain("本人");
  expect(guide?.steps?.join(" ")).toContain("自分の番でなくても");
  expect(guide?.hostTimerGuide).toContain("自動で始まります");
  expect(guide?.hostMessage).toContain("ホストも");
  expect(guide?.hostMessage).toContain("次の人へ");
  expect(guide?.steps?.join(" ")).not.toContain("話し合って決める");
});
