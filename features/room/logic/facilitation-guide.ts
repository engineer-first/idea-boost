import type { RoomPhase } from "@/contracts/phase";
import { DOT_VOTE_CRITERIA, DOT_VOTE_GUIDANCE } from "@/features/dot-vote";

export type FacilitationGuideContent = {
  durationMinutes: number;
  message: string;
  hostMessage: string | null;
  purpose?: string;
  steps?: readonly string[];
  example?: string | null;
  completion?: string;
  modalIntro?: string;
  modalTitle?: string;
  modalExamples?: readonly string[];
  modalPurpose?: string | null;
};

const DEFAULT_DETAILS = {
  purpose: "このステップで考えることを整理します。",
  steps: [
    "画面の案内を確認する",
    "付箋を使って作業する",
    "終わったら進行役の案内を待つ",
  ],
  example: null,
  completion: "このステップの作業が終わったら完了です。",
} as const;

const DOT_VOTE_GUIDE_STEPS = [
  DOT_VOTE_GUIDANCE.target,
  DOT_VOTE_CRITERIA.subjective,
  DOT_VOTE_CRITERIA.objective,
  DOT_VOTE_GUIDANCE.operation,
  DOT_VOTE_GUIDANCE.withdrawal,
] as const;

const FACILITATION_GUIDES: Record<
  1 | 2 | 3,
  Record<number, FacilitationGuideContent>
> = {
  1: {
    1: {
      durationMinutes: 3,
      message:
        "デザインスプリントを始めよう！まずは最近あった困ったことを、1枚につき1つ付箋に書き出そう。",
      hostMessage:
        "右上からタイマーを設定しよう！\nタイマーが終了したら次のステップへ進もう。",
      ...DEFAULT_DETAILS,
      modalIntro: "デザインスプリントを始めよう！",
      modalTitle: "最近あった困ったことを付箋に書き出そう。",
      modalExamples: [
        "学校の出席率がまずい",
        "やることの優先順位を決められない",
      ],
    },
    2: {
      durationMinutes: 6,
      message:
        "自分の付箋をドラッグしてみんなに共有しよう。順番を決めて発表しよう。",
      hostMessage: "全員の共有が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "作成した付箋をメンバーに共有しよう！",
      modalPurpose: null,
      steps: [
        "共有する順番を話し合って決める",
        "最初の順番の人がすべての付箋を一つずつ説明しながら共有する。",
        "決めた順番通り次の人が発表する",
      ],
    },
    3: {
      durationMinutes: 4,
      message: "共有した付箋のうち、似ているものを近づけてグループに分けよう。",
      hostMessage: "グループ化が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "似ている課題を集めて整理しよう！",
      modalPurpose: null,
      steps: [
        "内容が似ている付箋を近くに移動する",
        "付箋のグループに名前をつける",
      ],
    },
    4: {
      durationMinutes: 3,
      message: DOT_VOTE_GUIDANCE.summary,
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "解決したい課題に投票しよう！",
      modalPurpose: null,
      steps: DOT_VOTE_GUIDE_STEPS,
    },
    5: {
      durationMinutes: 10,
      message: "投票結果を参考に、取り組む課題をみんなで1つ決めよう。",
      hostMessage:
        "納得できるまで話し合い、1つに絞れたら次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "取り組む課題を1つに決めよう！",
      modalPurpose: null,
      steps: [
        "投票結果で票が集まった課題を確認する",
        "なぜその課題が重要なのかを話し合う",
        "これから取り組む課題を1つに決める",
      ],
    },
  },
  2: {
    1: {
      durationMinutes: 3,
      message: "決定した課題に対するHMWを、付箋に書き出そう。",
      hostMessage:
        "右上からタイマーを設定しよう！\nタイマーが終了したら次のステップへ進もう。",
      purpose: "決定した課題を、アイデアが生まれる問いに変換します。",
      example: null,
      completion: "アイデアにつながる問いを複数書き出せたら完了です。",
      modalIntro: "次は、問いをつくろう！",
      modalTitle: "決めた課題を、アイデアが生まれる問いに変えよう！",
      modalPurpose: null,
      steps: [
        "決定した課題に対して\n「どうすれば私たちは〇〇できるだろう？」の形に言い換える",
      ],
      modalExamples: [
        "課題: 学校の出席率がまずい",
        "問い: あと何日休めるだろう？",
      ],
    },
    2: {
      durationMinutes: 6,
      message:
        "自分の付箋をドラッグしてみんなに共有しよう。順番を決めて発表しよう。",
      hostMessage: "全員の共有が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "作成した問いをメンバーに共有しよう！",
      modalPurpose: null,
      steps: [
        "最初の順番の人が、問いを1つずつ説明しながら共有する",
        "決めた順番に沿って、次の人が発表する",
      ],
    },
    3: {
      durationMinutes: 4,
      message: DOT_VOTE_GUIDANCE.summary,
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "アイデアが広がりそうな問いに投票しよう！",
      modalPurpose: null,
      steps: DOT_VOTE_GUIDE_STEPS,
    },
    4: {
      durationMinutes: 10,
      message: "投票結果を参考に、HMWをみんなで1つ決めよう。",
      hostMessage:
        "納得できるまで話し合い、1つに絞れたら次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "次に考える問いを1つに決めよう！",
      modalPurpose: null,
      steps: [
        "投票結果で票が集まった問いを確認する",
        "その問いからアイデアを広げられそうか話し合う",
        "次のフェーズで使う問いを1つに決める",
      ],
    },
  },
  3: {
    1: {
      durationMinutes: 3,
      message:
        "決定したHMWをもとに、解決策を付箋に書き出そう。書き終えたら手を止めて待とう。",
      hostMessage:
        "右上からタイマーを設定しよう！\nタイマーが終了したら次のステップへ進もう。",
      ...DEFAULT_DETAILS,
      modalIntro: "最後は、解決策を考えよう！",
      modalTitle: "決めた問いに対する解決策を書き出そう",
      modalPurpose: null,
      steps: [
        "決定した問いを読み返す",
        "実現方法を気にしすぎず、思いついた案を書き出す",
        "1枚の付箋に1つの解決策を書く",
      ],
      modalExamples: [
        "スマホアプリで残りの休める日数が簡単にわかる。",
        "pcのgoogle拡張機能でwebから簡単に確認できる。",
      ],
    },
    2: {
      durationMinutes: 6,
      message:
        "解決策をみんなに共有し、発表しながら2軸マップに置こう。ほかの人が発表している間は手を止めて聞こう。",
      hostMessage: "全員の共有が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "解決策を共有してマップに置こう！",
      modalPurpose: null,
      steps: [
        "解決策を1つずつ説明しながら共有する",
        "価値と実現のしやすさを考えて、マップへ仮置きする",
      ],
    },
    3: {
      durationMinutes: 7,
      message:
        "付箋を動かし、縦軸の「価値」と横軸の「実現可能性」で評価しよう。",
      hostMessage: "評価が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "解決策を価値と実現のしやすさで比べよう！",
      modalPurpose: null,
      steps: [
        "上にあるほど価値が高く、右にあるほど実現しやすいことを確認する",
        "解決策について話し合いながら付箋を移動する",
        "全員が納得できる位置を決める",
      ],
    },
    4: {
      durationMinutes: 3,
      message: DOT_VOTE_GUIDANCE.summary,
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "採用したい解決策に投票しよう！",
      modalPurpose: null,
      steps: DOT_VOTE_GUIDE_STEPS,
    },
    5: {
      durationMinutes: 10,
      message: "投票結果を参考に、採用する解決策をみんなで1つ決めよう。",
      hostMessage: "1つに決定したら、デザインスプリントは完了です。",
      ...DEFAULT_DETAILS,
      modalTitle: "採用する解決策を1つに決めよう！",
      modalPurpose: null,
      steps: [
        "投票結果とマップ上の位置を確認する",
        "解決策の価値と実現のしやすさを話し合う",
        "実際に取り組む解決策を1つに決める",
      ],
    },
  },
};

export function getFacilitationGuide(
  phase: RoomPhase,
): FacilitationGuideContent | null {
  if (phase.kind === "lobby") return null;
  return FACILITATION_GUIDES[phase.phase][phase.step];
}
