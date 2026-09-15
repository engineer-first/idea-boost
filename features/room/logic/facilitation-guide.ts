import type { RoomPhase } from "@/contracts/phase";

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

const FACILITATION_GUIDES: Record<
  1 | 2 | 3,
  Record<number, FacilitationGuideContent>
> = {
  1: {
    1: {
      durationMinutes: 3,
      message:
        "デザインスプリントを始めよう！まずは最近あった困ったことを、1枚につき1つ付箋に書き出そう。",
      hostMessage: "タイマーが終了したら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalIntro: "デザインスプリントを始めよう！",
      modalTitle: "最近あった困ったことを付箋に書き出そう。",
      modalExamples: [
        "会議で発言する人が偏る",
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
        "全員が共有した付箋を見渡す",
        "内容が似ている付箋を近くに移動する",
        "まとまりごとに、内容が伝わる名前をつける",
      ],
    },
    4: {
      durationMinutes: 3,
      message:
        "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "解決したい課題に投票しよう！",
      modalPurpose: null,
      steps: [
        "赤い主観シールを、直感で最も気になる課題に1票貼る",
        "青い客観シールを、重要だと思う課題に3票貼る",
        "4票すべて貼ったら、ほかのメンバーを待つ",
      ],
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
      hostMessage: null,
      purpose: "決定した課題を、アイデアが生まれる問いに変換します。",
      example:
        "課題: 会議で発言する人が偏る\n問い: どうすれば私たちは、初参加者も安心して意見を出せるだろう？",
      completion: "アイデアにつながる問いを複数書き出せたら完了です。",
      modalIntro: "次は、問いをつくろう！",
      modalTitle: "決めた課題を、アイデアが生まれる問いに変えよう！",
      modalPurpose: null,
      steps: [
        "決定した課題を読み返す",
        "「どうすれば私たちは〜できるだろう？」の形に言い換える",
        "1枚の付箋に1つの問いを書く",
      ],
      modalExamples: [
        "課題: 会議で発言する人が偏る",
        "問い: どうすれば私たちは、全員が安心して意見を出せるだろう？",
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
        "共有する順番を話し合って決める",
        "最初の順番の人が、問いを1つずつ説明しながら共有する",
        "決めた順番に沿って、次の人が発表する",
      ],
    },
    3: {
      durationMinutes: 4,
      message:
        "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "アイデアが広がりそうな問いに投票しよう！",
      modalPurpose: null,
      steps: [
        "赤い主観シールを、考えてみたい問いに1票貼る",
        "青い客観シールを、多くのアイデアにつながりそうな問いに3票貼る",
        "4票すべて貼ったら、ほかのメンバーを待つ",
      ],
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
        "決定したHMWをもとに、アイデアを付箋に書き出そう。書き終えたら手を止めて待とう。",
      hostMessage: "個人ワークの時間を守って進行してください。",
      ...DEFAULT_DETAILS,
      modalIntro: "最後は、アイデアを考えよう！",
      modalTitle: "決めた問いに答えるアイデアを書き出そう！",
      modalPurpose: null,
      steps: [
        "決定した問いを読み返す",
        "実現方法を気にしすぎず、思いついた案を書き出す",
        "1枚の付箋に1つのアイデアを書く",
      ],
      modalExamples: [
        "発言前に全員が匿名で意見を書けるようにする",
        "一人ずつ順番に話す時間をつくる",
      ],
    },
    2: {
      durationMinutes: 6,
      message:
        "アイデアをみんなに共有し、発表しながら2軸マップに置こう。ほかの人が発表している間は手を止めて聞こう。",
      hostMessage: "全員の共有が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "アイデアを共有してマップに置こう！",
      modalPurpose: null,
      steps: [
        "共有する順番を話し合って決める",
        "アイデアを1つずつ説明しながら共有する",
        "価値と実現のしやすさを考えて、マップへ仮置きする",
      ],
    },
    3: {
      durationMinutes: 7,
      message:
        "付箋を動かし、縦軸の「価値」と横軸の「実現可能性」で評価しよう。",
      hostMessage: "評価が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "アイデアを価値と実現のしやすさで比べよう！",
      modalPurpose: null,
      steps: [
        "上にあるほど価値が高く、右にあるほど実現しやすいことを確認する",
        "アイデアについて話し合いながら付箋を移動する",
        "全員が納得できる位置を決める",
      ],
    },
    4: {
      durationMinutes: 3,
      message:
        "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      modalTitle: "採用したいアイデアに投票しよう！",
      modalPurpose: null,
      steps: [
        "赤い主観シールを、最も試してみたいアイデアに1票貼る",
        "青い客観シールを、価値と実現のしやすさを考えて3票貼る",
        "4票すべて貼ったら、ほかのメンバーを待つ",
      ],
    },
    5: {
      durationMinutes: 10,
      message: "投票結果を参考に、採用するアイデアをみんなで1つ決めよう。",
      hostMessage: "1つに決定したら、デザインスプリントは完了です。",
      ...DEFAULT_DETAILS,
      modalTitle: "採用するアイデアを1つに決めよう！",
      modalPurpose: null,
      steps: [
        "投票結果とマップ上の位置を確認する",
        "アイデアの価値と実現のしやすさを話し合う",
        "実際に取り組むアイデアを1つに決める",
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
