import { describe, expect, it } from "vitest";
import { buildLobbyPhase, buildPhaseStep } from "@/contracts/phase.fixture";
import { getFacilitationGuide } from "./facilitation-guide";

describe("getFacilitationGuide", () => {
  it.each([
    [
      buildPhaseStep(1),
      3,
      "デザインスプリントを始めよう！まずは最近あった困ったことを、1枚につき1つ付箋に書き出そう。",
      "タイマーが終了したら、次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(2),
      6,
      "自分の付箋をドラッグしてみんなに共有しよう。順番を決めて発表しよう。",
      "全員の共有が終わったら、次のステップへ進んでください。",
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
      "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
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
      null,
    ],
    [
      buildPhaseStep(2, 2),
      6,
      "自分の付箋をドラッグしてみんなに共有しよう。順番を決めて発表しよう。",
      "全員の共有が終わったら、次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(3, 2),
      4,
      "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
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
      "決定したHMWをもとに、アイデアを付箋に書き出そう。書き終えたら手を止めて待とう。",
      "個人ワークの時間を守って進行してください。",
    ],
    [
      buildPhaseStep(2, 3),
      6,
      "アイデアをみんなに共有し、発表しながら2軸マップに置こう。ほかの人が発表している間は手を止めて聞こう。",
      "全員の共有が終わったら、次のステップへ進んでください。",
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
      "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
      "全員の投票が終わったら、次のステップへ進んでください。",
    ],
    [
      buildPhaseStep(5, 3),
      10,
      "投票結果を参考に、採用するアイデアをみんなで1つ決めよう。",
      "1つに決定したら、デザインスプリントは完了です。",
    ],
  ] as const)("%o の所要時間・参加者向けガイド・ホスト向けガイドを返す", (phase, durationMinutes, message, hostMessage) => {
    expect(getFacilitationGuide(phase)).toMatchObject({
      durationMinutes,
      message,
      hostMessage,
    });
  });

  it("ロビーではガイドを返さない", () => {
    expect(getFacilitationGuide(buildLobbyPhase())).toBeNull();
  });
});
