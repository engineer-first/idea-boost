import { describe, expect, it } from "vitest";
import { buildLobbyPhase, buildPhaseStep } from "@/contracts/phase.fixture";
import { getFacilitationGuide } from "./facilitation-guide";

describe("getFacilitationGuide", () => {
  it("フェーズ1 Step 3のやることをグループ名付けの流れで返す", () => {
    expect(getFacilitationGuide(buildPhaseStep(3, 1))?.steps).toEqual([
      "内容が似ている付箋を近くに移動する",
      "付箋のグループに名前をつける",
    ]);
  });

  it("フェーズ2 Step 1のやることを1項目だけ返す", () => {
    expect(getFacilitationGuide(buildPhaseStep(1, 2))?.steps).toEqual([
      "決定した課題に対して\n「どうすれば私たちは〇〇できるだろう？」の形に言い換える",
    ]);
  });

  it("フェーズ2 Step 2のやることから順番決めを除く", () => {
    expect(getFacilitationGuide(buildPhaseStep(2, 2))?.steps).toEqual([
      "最初の順番の人が、問いを1つずつ説明しながら共有する",
      "右上の順番に沿って、次の人が発表する",
    ]);
  });

  it("フェーズ3 Step 2のやることから順番決めを除く", () => {
    expect(getFacilitationGuide(buildPhaseStep(2, 3))?.steps).toEqual([
      "右上の順番に沿って、解決策を1つずつ説明しながら共有する",
      "価値と実現のしやすさを考えて、マップへ仮置きする",
    ]);
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

  it.each([
    [
      buildPhaseStep(1),
      3,
      "デザインスプリントを始めよう！まずは最近あった困ったことを、1枚につき1つ付箋に書き出そう。",
      "右上からタイマーを設定しよう！\nタイマーが終了したら次のステップへ進もう。",
    ],
    [
      buildPhaseStep(2),
      6,
      "右上の順番に沿って、自分の付箋を説明しながらドラッグして共有しよう。",
      "右上で持ち時間を設定して開始し、話の区切りで「次の人へ」を押してください。一巡後に次のステップへ進みます。",
    ],
    [
      buildPhaseStep(3),
      4,
      "共有した付箋のうち、似ているものを近づけてグループに分けよう。",
      "グループ化が終わったら、次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(4),
      3,
      "主観1票・客観3票を使い、現在のフェーズの個々の付箋へ投票します。",
      "全員の投票が終わったら、次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(5),
      10,
      "投票結果を参考に、取り組む課題をみんなで1つ決めよう。",
      "納得できるまで話し合い、1つに絞れたら次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(1, 2),
      3,
      "決定した課題に対するHMWを、付箋に書き出そう。",
      "右上からタイマーを設定しよう！\nタイマーが終了したら次のステップへ進もう。",
    ],
    [
      buildPhaseStep(2, 2),
      6,
      "右上の順番に沿って、自分の付箋を説明しながらドラッグして共有しよう。",
      "右上で持ち時間を設定して開始し、話の区切りで「次の人へ」を押してください。一巡後に次のステップへ進みます。",
    ],
    [
      buildPhaseStep(3, 2),
      4,
      "主観1票・客観3票を使い、現在のフェーズの個々の付箋へ投票します。",
      "全員の投票が終わったら、次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(4, 2),
      10,
      "投票結果を参考に、HMWをみんなで1つ決めよう。",
      "納得できるまで話し合い、1つに絞れたら次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(1, 3),
      3,
      "決定したHMWをもとに、解決策を付箋に書き出そう。書き終えたら手を止めて待とう。",
      "右上からタイマーを設定しよう！\nタイマーが終了したら次のステップへ進もう。",
    ],
    [
      buildPhaseStep(2, 3),
      6,
      "解決策をみんなに共有し、発表しながら2軸マップに置こう。ほかの人が発表している間は手を止めて聞こう。",
      "右上で持ち時間を設定して開始し、話の区切りで「次の人へ」を押してください。一巡後に次のステップへ進みます。",
    ],
    [
      buildPhaseStep(3, 3),
      7,
      "付箋を動かし、縦軸の「価値」と横軸の「実現可能性」で評価しよう。",
      "評価が終わったら、次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(4, 3),
      3,
      "主観1票・客観3票を使い、現在のフェーズの個々の付箋へ投票します。",
      "全員の投票が終わったら、次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(5, 3),
      10,
      "投票結果を参考に、採用する解決策をみんなで1つ決めよう。",
      "1つに決定したら、デザインスプリントは完了です。",
    ],
  ] as const)("%o の所要時間・参加者向けガイド・ホスト向けガイドを返す", (phase, durationMinutes, message, hostMessage) => {
    expect(getFacilitationGuide(phase)).toMatchObject({
      durationMinutes,
      message,
      hostMessage,
    });
  });

  it.each([
    [buildPhaseStep(2), "全員の共有"],
    [buildPhaseStep(4), "全員の投票"],
    [buildPhaseStep(5), "ホストが採用する付箋を確定"],
    [buildPhaseStep(3, 3), "全員が納得できる位置"],
    [buildPhaseStep(5, 3), "スプリントは完了"],
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
] as const)("フェーズ%iの共有は右上の固定順と進行操作を案内する", (phase) => {
  const guide = getFacilitationGuide(buildPhaseStep(2, phase));
  expect(guide?.steps?.join(" ")).toContain("右上");
  expect(guide?.hostMessage).toContain("次の人へ");
  expect(guide?.steps?.join(" ")).not.toContain("話し合って決める");
});
