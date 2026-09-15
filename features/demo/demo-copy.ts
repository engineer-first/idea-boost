import type { DemoCheckpoint } from "@/contracts/demo";
import { isResultStep, isVotingStep, type RoomPhase } from "@/contracts/phase";

export const DEMO_CHECKPOINTS: readonly {
  value: DemoCheckpoint;
  label: string;
  description: string;
}[] = [
  {
    value: "start",
    label: "最初から",
    description: "5人のチームで、まずは一人ずつ困りごとを書き出します。",
  },
  {
    value: "share",
    label: "共有直前",
    description: "自分の付箋を共有し、他4人の意見が集まる瞬間を見せます。",
  },
  {
    value: "vote",
    label: "投票直前",
    description: "他の人の票を見ずに選び、結果を公開して課題を決めます。",
  },
  {
    value: "ideas",
    label: "アイデア比較",
    description:
      "決めた課題と問いをもとに、価値と実現のしやすさで案を比べます。",
  },
  {
    value: "complete",
    label: "完了",
    description: "課題から問い、採用アイデアまでのつながりを振り返ります。",
  },
];

export const DEMO_INTRO =
  "学生生活の困りごとを解決するアプリを、5人のチームで考えます。あなたがホストとして操作し、他4人は合図に合わせて共有・投票します。";
export const DEMO_FREEDOM =
  "付箋の追加や投票先は自由です。用意した課題と別の課題を選ぶと、その先の問い・アイデアとつながらない場合があります。";

const RECOMMENDATIONS = {
  1: "空きコマに一緒に勉強する仲間が見つからない",
  2: "どうすれば、空きコマに気軽に学び合う仲間と出会えるだろう？",
  3: "空きコマ勉強マッチ：今いる場所と学びたい科目で仲間を探す",
} as const;

export function getDemoScript(phase: RoomPhase): string {
  if (phase.kind === "lobby")
    return "5人のチームで、課題からアイデア決定まで進めます。";
  if (isVotingStep(phase))
    return "自分の赤1票・青3票を使い、他4人の投票を合図します。次のステップで初めて全員の結果を公開します。";
  if (isResultStep(phase))
    return phase.phase === 3
      ? `おすすめは「${RECOMMENDATIONS[3]}」。採用案を決め、課題から問い、アイデアまでのつながりを振り返ります。`
      : `おすすめは「${RECOMMENDATIONS[phase.phase]}」。票を参考に1つ選んで決定すると、次のフェーズへ引き継がれます。`;
  if (phase.step === 1)
    return `個人の付箋は本人だけに見えます。自分の付箋に「${RECOMMENDATIONS[phase.phase]}」と書き、画面上の進行ボタンで共有へ進みます。`;
  if (phase.phase === 1 && phase.step === 3)
    return "似た課題を近くに動かしてグループにまとめます。整理できたら、画面上の進行ボタンで投票へ進みます。";
  if (phase.phase === 3 && phase.step === 3)
    return "付箋を動かして、価値と実現のしやすさを比べます。おすすめは、小さく試せる案です。";
  return "自分の付箋を共有スペースへドラッグし、他4人の共有を合図します。全員の意見を並べて、似た内容を整理します。";
}
