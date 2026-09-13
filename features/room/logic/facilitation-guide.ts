import type { RoomPhase } from "@/contracts/phase";

export type FacilitationGuideContent = {
  durationMinutes: number;
  message: string;
  hostMessage: string | null;
  purpose?: string;
  steps?: readonly string[];
  example?: string | null;
  completion?: string;
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
    },
    2: {
      durationMinutes: 6,
      message:
        "自分の付箋をドラッグしてみんなに共有しよう。順番を決めて発表しよう。",
      hostMessage: "全員の共有が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
    3: {
      durationMinutes: 4,
      message: "共有した付箋のうち、似ているものを近づけてグループに分けよう。",
      hostMessage: "グループ化が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
    4: {
      durationMinutes: 3,
      message:
        "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
    5: {
      durationMinutes: 10,
      message: "投票結果を参考に、取り組む課題をみんなで1つ決めよう。",
      hostMessage:
        "納得できるまで話し合い、1つに絞れたら次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
  },
  2: {
    1: {
      durationMinutes: 3,
      message: "決定した課題に対するHMWを、付箋に書き出そう。",
      hostMessage: null,
      purpose: "決定した課題を、アイデアが生まれる問いに変換します。",
      steps: [
        "決定した課題を読み返す",
        "解決できた状態を考える",
        "問いを1枚につき1つ書く",
      ],
      example:
        "課題: 会議で発言する人が偏る\n問い: どうすれば私たちは、初参加者も安心して意見を出せるだろう？",
      completion: "アイデアにつながる問いを複数書き出せたら完了です。",
    },
    2: {
      durationMinutes: 6,
      message:
        "自分の付箋をドラッグしてみんなに共有しよう。順番を決めて発表しよう。",
      hostMessage: "全員の共有が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
    3: {
      durationMinutes: 4,
      message:
        "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
    4: {
      durationMinutes: 10,
      message: "投票結果を参考に、HMWをみんなで1つ決めよう。",
      hostMessage:
        "納得できるまで話し合い、1つに絞れたら次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
  },
  3: {
    1: {
      durationMinutes: 3,
      message:
        "決定したHMWをもとに、アイデアを付箋に書き出そう。書き終えたら手を止めて待とう。",
      hostMessage: "個人ワークの時間を守って進行してください。",
      ...DEFAULT_DETAILS,
    },
    2: {
      durationMinutes: 6,
      message:
        "アイデアをみんなに共有し、発表しながら2軸マップに置こう。ほかの人が発表している間は手を止めて聞こう。",
      hostMessage: "全員の共有が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
    3: {
      durationMinutes: 7,
      message:
        "付箋を動かし、縦軸の「価値」と横軸の「実現可能性」で評価しよう。",
      hostMessage: "評価が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
    4: {
      durationMinutes: 3,
      message:
        "1人あたり、主観1票・客観3票まで投票できるよ。進行役の指示を待とう！",
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
    },
    5: {
      durationMinutes: 10,
      message: "投票結果を参考に、採用するアイデアをみんなで1つ決めよう。",
      hostMessage: "1つに決定したら、デザインスプリントは完了です。",
      ...DEFAULT_DETAILS,
    },
  },
};

export function getFacilitationGuide(
  phase: RoomPhase,
): FacilitationGuideContent | null {
  if (phase.kind === "lobby") return null;
  return FACILITATION_GUIDES[phase.phase][phase.step];
}
