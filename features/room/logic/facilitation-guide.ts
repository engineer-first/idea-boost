import type { RoomPhase } from "@/contracts/phase";
import { DOT_VOTE_CRITERIA, DOT_VOTE_GUIDANCE } from "@/features/dot-vote";

export type FacilitationGuideContent = {
  durationMinutes: number;
  intro: string;
  action?: string;
  firstAction?: string;
  visualExample?: {
    caption: string;
    items: readonly string[];
    grouped?: boolean;
    flow?: boolean;
  };
  message: string;
  hostMessage: string | null;
  hostTimerGuide?: string;
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
  example: null,
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
      durationMinutes: 5,
      action: "困ったことを書く",
      firstAction: "「付箋を追加」を押し、最近あった困ったことを1つ書く。",
      visualExample: {
        caption: "例：1枚に1つ",
        items: ["朝、起きられない", "宿題を忘れる"],
      },
      intro: "まずは、最近あった困ったことを付箋に。1枚に1つずつ書こう。",
      message: "1枚につき1つ書こう。",
      hostMessage: "書き終えた人を確認して、次のステップへ進みます。",
      purpose: "まずは一人で考えます。共有するまで、自分だけに見えます。",
      completion: "書き終えたら、ホストの案内を待ちます。",
      modalIntro: "アイデア出しを始めよう！",
      modalTitle: "最近あった困ったことを付箋に書き出そう。",
      modalExamples: [
        "学校の出席率がまずい",
        "やることの優先順位を決められない",
      ],
    },
    2: {
      durationMinutes: 6,
      action: "一人ずつ話して共有する",
      firstAction: "画面上の「発表中」の名前を確認する。",
      visualExample: {
        caption: "発表の流れ（例）",
        items: ["1人目が話す", "次の人へ", "2人目が話す"],
        flow: true,
      },
      intro: "画面上の名前を見て、一人ずつ付箋を説明して共有しよう。",
      message: "画面上の順番に沿って、付箋を説明しながらボードへ動かそう。",
      hostMessage:
        "発表者本人に加え、ホストも画面上の「次の人へ」で交代できます。全員が話したら次へ進みます。",
      purpose: "一人ずつ話して、全員の考えを聞きます。",
      completion: "全員の共有が終わったら、次のステップへ進みます。",
      modalTitle: "作成した付箋をメンバーに共有しよう！",
      modalPurpose: null,
      steps: [
        "自分の番に、付箋を説明しながらボードへドラッグする",
        "話し終えた本人が、画面上の「次の人へ」を押す",
        "発表の順番は目安です。自分の番でなくても付箋を共有できます。",
      ],
    },
    3: {
      durationMinutes: 4,
      action: "似た付箋を集める",
      firstAction: "似ている付箋を2枚、近くに動かす。",
      visualExample: {
        caption: "例：「時間の管理」でまとめる",
        items: ["宿題を忘れる", "予定を忘れる"],
        grouped: true,
      },
      intro: "似ている付箋を近づけよう。集まったグループに名前をつけよう。",
      message: "共有した付箋のうち、似ているものを近づけてグループに分けよう。",
      hostMessage: "グループ化が終わったら、次のステップへ進んでください。",
      purpose:
        "同じ困りごとを見つけ、次の投票で比べやすくします。似ていない付箋はそのままで大丈夫です。",
      completion: "グループ化が終わったら、次のステップへ進みます。",
      modalTitle: "似ている課題を集めて整理しよう！",
      modalPurpose: null,
      steps: [
        "枠ができたら、枠の上の名前を押す",
        "共通する内容を、短い名前にする",
      ],
    },
    4: {
      durationMinutes: 3,
      action: "付箋を選んで投票する",
      firstAction: "画面下のシールを選び、投票したい付箋を押す。",
      visualExample: { caption: "使える票", items: ["主観 1票", "客観 3票"] },
      intro: "付箋に主観1票・客観3票を貼ろう。シールを押すと取り消せます。",
      message: DOT_VOTE_GUIDANCE.summary,
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      purpose: "自分が取り組みたい案と、ほかの人にも役立つ案を選びます。",
      completion: "全員の投票が終わったら、次のステップへ進みます。",
      modalTitle: "解決したい課題に投票しよう！",
      modalPurpose: null,
      steps: DOT_VOTE_GUIDE_STEPS,
    },
    5: {
      durationMinutes: 10,
      intro: "投票結果を見て、取り組む課題を1つ話し合おう。",
      message: "投票結果を参考に、取り組む課題をみんなで1つ決めよう。",
      hostMessage:
        "納得できるまで話し合い、1つに絞れたら次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      completion: "1つに絞れたら、ホストが採用する付箋を確定します。",
      modalTitle: "取り組む課題を1つに決めよう！",
      modalPurpose: null,
      steps: [
        "投票結果で票が集まった課題を確認する",
        "なぜその課題が重要なのかを話し合う",
        "これから取り組む課題を1つに決める",
        "ホストが画面下から採用する付箋を選び、1件を確定する",
      ],
    },
  },
  2: {
    1: {
      durationMinutes: 3,
      action: "課題を質問に変える",
      firstAction: "決定した課題を読み、「付箋を追加」を押す。",
      visualExample: {
        caption: "課題から質問へ（例）",
        items: ["学校に来られない", "どうすれば、来やすくなる？"],
        flow: true,
      },
      intro: "決めた課題を、もっとくわしく見てみよう！",
      message: "何をよくしたいのかがわかる質問を、付箋に書こう。",
      hostMessage: null,
      purpose: "課題の何が困っているのか、どうなったらよいのかを考えます。",
      example: null,
      completion: undefined,
      modalIntro: "次は、課題をくわしく見てみよう！",
      modalTitle: "決めた課題を、もっとくわしく見てみよう！",
      modalPurpose: null,
      steps: [
        "課題を見て、何が困っているのかを考える",
        "どうなったらよいかを考える",
        "「どうすれば私たちは〇〇できるだろう？」の形で書く",
      ],
      modalExamples: [
        "課題: 学校に来られない人が多い",
        "質問: どうすれば、学校に来やすくなるだろう？",
      ],
    },
    2: {
      durationMinutes: 6,
      action: "一人ずつ話して共有する",
      firstAction: "画面上の「発表中」の名前を確認する。",
      visualExample: {
        caption: "発表の流れ（例）",
        items: ["1人目が話す", "次の人へ", "2人目が話す"],
        flow: true,
      },
      intro: "決めた順番に、問いを1つずつ説明しながら共有しよう。",
      message: "画面上の順番に沿って、付箋を説明しながらボードへ動かそう。",
      hostMessage:
        "発表者本人に加え、ホストも画面上の「次の人へ」で交代できます。全員が話したら次へ進みます。",
      purpose: "一人ずつ話して、全員の考えを聞きます。",
      completion: "全員の共有が終わったら、次のステップへ進みます。",
      modalTitle: "作成した問いをメンバーに共有しよう！",
      modalPurpose: null,
      steps: [
        "自分の番に、問いを説明しながらボードへドラッグする",
        "話し終えた本人が、画面上の「次の人へ」を押す",
        "発表の順番は目安です。自分の番でなくても付箋を共有できます。",
      ],
    },
    3: {
      durationMinutes: 4,
      action: "付箋を選んで投票する",
      firstAction: "画面下のシールを選び、投票したい付箋を押す。",
      visualExample: { caption: "使える票", items: ["主観 1票", "客観 3票"] },
      intro: "付箋に主観1票・客観3票を貼ろう。シールを押すと取り消せます。",
      message: DOT_VOTE_GUIDANCE.summary,
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      purpose: "自分が取り組みたい案と、ほかの人にも役立つ案を選びます。",
      completion: "全員の投票が終わったら、次のステップへ進みます。",
      modalTitle: "アイデアが広がりそうな問いに投票しよう！",
      modalPurpose: null,
      steps: DOT_VOTE_GUIDE_STEPS,
    },
    4: {
      durationMinutes: 10,
      intro: "投票結果を見て、アイデアが広がる問いを1つ話し合おう。",
      message: "投票結果を参考に、問いをみんなで1つ決めよう。",
      hostMessage:
        "納得できるまで話し合い、1つに絞れたら次のステップへ進んでください。",
      ...DEFAULT_DETAILS,
      completion: "1つに絞れたら、ホストが採用する問いを確定します。",
      modalTitle: "次に考える問いを1つに決めよう！",
      modalPurpose: null,
      steps: [
        "投票結果で票が集まった問いを確認する",
        "その問いからアイデアを広げられそうか話し合う",
        "次のフェーズで使う問いを1つに決める",
        "ホストが画面下から採用する問いを選び、1件を確定する",
      ],
    },
  },
  3: {
    1: {
      durationMinutes: 5,
      intro: "決めた問いに対する解決策を付箋に。実現方法を気にしすぎず書こう。",
      message:
        "決定した問いをもとに、解決策を付箋に書き出そう。書き終えたら手を止めて待とう。",
      hostMessage: null,
      ...DEFAULT_DETAILS,
      completion: undefined,
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
      action: "一人ずつ話して共有する",
      firstAction: "画面上の「発表中」の名前を確認する。",
      visualExample: {
        caption: "発表の流れ（例）",
        items: ["1人目が話す", "次の人へ", "2人目が話す"],
        flow: true,
      },
      intro: "一人ずつ解決策を説明し、2軸マップへ仮置きしよう。",
      message:
        "一人ずつ解決策を説明し、価値と実現のしやすさを考えて2軸マップへ置こう。",
      hostMessage:
        "発表者本人に加え、ホストも画面上の「次の人へ」で交代できます。全員が話したら次へ進みます。",
      purpose: "一人ずつ話して、全員の考えを聞きます。",
      completion: "全員の共有が終わったら、次のステップへ進みます。",
      modalTitle: "解決策を共有してマップに置こう！",
      modalPurpose: null,
      steps: [
        "自分の番に、解決策を説明しながらマップへドラッグする",
        "話し終えた本人が、画面上の「次の人へ」を押す",
        "発表の順番は目安です。自分の番でなくても付箋を共有できます。",
      ],
    },
    3: {
      durationMinutes: 7,
      action: "付箋を動かして比べる",
      firstAction: "解決策を1枚選び、話し合いながらマップで動かす。",
      visualExample: {
        caption: "マップの読み方",
        items: ["上ほど価値が高い", "右ほど実現しやすい"],
      },
      intro: "付箋を動かして比べよう。上ほど価値が高く、右ほど実現しやすい。",
      message:
        "付箋を動かし、縦軸の「価値」と横軸の「実現可能性」で評価しよう。",
      hostMessage: "評価が終わったら、次のステップへ進んでください。",
      purpose: "どの案に価値があり、実現できそうかを比べます。",
      completion: "全員が納得できる位置を決めたら、次のステップへ進みます。",
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
      action: "付箋を選んで投票する",
      firstAction: "画面下のシールを選び、投票したい付箋を押す。",
      visualExample: { caption: "使える票", items: ["主観 1票", "客観 3票"] },
      intro: "付箋に主観1票・客観3票を貼ろう。シールを押すと取り消せます。",
      message: DOT_VOTE_GUIDANCE.summary,
      hostMessage: "全員の投票が終わったら、次のステップへ進んでください。",
      purpose: "自分が取り組みたい案と、ほかの人にも役立つ案を選びます。",
      completion: "全員の投票が終わったら、次のステップへ進みます。",
      modalTitle: "採用したい解決策に投票しよう！",
      modalPurpose: null,
      steps: [
        "上ほど価値が高く、右ほど実現しやすいことを確認する",
        ...DOT_VOTE_GUIDE_STEPS,
      ],
    },
    5: {
      durationMinutes: 10,
      intro: "投票結果とマップを見て、取り組む解決策を1つ話し合おう。",
      message: "投票結果を参考に、採用する解決策をみんなで1つ決めよう。",
      hostMessage:
        "1つに決定したら、完了チェックを押して成果を確認しましょう。",
      ...DEFAULT_DETAILS,
      completion:
        "ホストが解決策を1つ確定し、完了チェックを押すと全員が成果を確認できます。",
      modalTitle: "採用する解決策を1つに決めよう！",
      modalPurpose: null,
      steps: [
        "投票結果とマップ上の位置を確認する",
        "上ほど価値が高く、右ほど実現しやすいことを確認する",
        "解決策の価値と実現のしやすさを話し合う",
        "実際に取り組む解決策を1つに決める",
        "ホストが画面下から採用する解決策を選び、1件を確定する",
        "ホストが画面右上の完了チェックを押して成果を表示する",
      ],
    },
  },
};

export function getFacilitationGuide(
  phase: RoomPhase,
): FacilitationGuideContent | null {
  if (phase.kind === "lobby") return null;
  const guide = FACILITATION_GUIDES[phase.phase][phase.step];
  return {
    ...guide,
    hostTimerGuide:
      phase.step === 2
        ? "共有のタイマーは自動で始まります。画面上の時間表示で残り時間を確認できます。"
        : "画面上の時間表示を押す → 分・秒を決める → 「開始」を押す。",
  };
}
