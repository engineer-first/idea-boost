import { STEP_ONE_ONBOARDING_SLIDES } from "./step-one-onboarding-copy";

export type StepGuideDiagramKind =
  | "timer"
  | "share-purpose"
  | "share"
  | "group-purpose"
  | "group"
  | "vote-purpose"
  | "vote"
  | "decision-purpose"
  | "decision"
  | "question-purpose"
  | "question-example"
  | "solution-purpose"
  | "solution-example"
  | "evaluation-purpose"
  | "evaluation";

export type StepGuideSlide = {
  title: string;
  description: string;
  illustration:
    | StepGuideDiagramKind
    | "many-notes"
    | "operation-video"
    | "add-note";
  illustrationAlt: string;
  videoSrc?: string;
};

const STEP_GUIDES: Readonly<Record<string, readonly StepGuideSlide[]>> = {
  "1-1": STEP_ONE_ONBOARDING_SLIDES,
  "1-2": [
    {
      title: "自分の困りごとを共有し、みんなの困りごとを知ろう。",
      description:
        "一人ひとりの困りごとを伝え合い、チームで考える材料を集めましょう。",
      illustration: "share-purpose",
      illustrationAlt: "一人ひとりの困りごとをチームで伝え合う",
    },
    {
      title: "自分の番が来たら発表して、次の人へ交代しよう。",
      description:
        "発表する順番は画面上部で確認できます。自分の番が来たら、マイ付箋をボードへドラッグして内容を説明しましょう。発表が終わったら「次の人へ」を押して交代します。",
      illustration: "share",
      videoSrc: "/onboarding/step-1-2.webm",
      illustrationAlt:
        "前の人の発表を待ち、自分の番に付箋を共有して発表し、次の人へ交代する流れ",
    },
  ],
  "1-3": [
    {
      title: "似ている困りごとを集めよう。",
      description: "共通している内容を見つけ、課題を見渡しましょう。",
      illustration: "group-purpose",
      illustrationAlt: "似た困りごとがまとまり、共通点が見える付箋",
    },
    {
      title: "付箋を動かして、似ているものを近づけよう。",
      description:
        "付箋を移動してグループに整理します。投票はグループでなく付箋1枚ずつに行います。",
      illustration: "group",
      videoSrc: "/onboarding/step-1-3.webm",
      illustrationAlt: "離れた付箋を近づけ、似た困りごとをまとめる流れ",
    },
  ],
  "1-4": [
    {
      title: "取り組みたい課題に投票しよう。",
      description:
        "主観は「激しく共感する、取り組みたい」。客観は「自分以外の人にも価値がありそう」。",
      illustration: "vote-purpose",
      illustrationAlt: "主観と客観の2つの基準で困りごとを考える",
    },
    {
      title: "主観1票・客観3票を、付箋に貼ろう。",
      description:
        "シールを付箋へドラッグします。自分のシールは押すかパレットへ戻すと取り消せます。投票中は他の人の票は見えません。",
      illustration: "vote",
      videoSrc: "/onboarding/step-1-4.webm",
      illustrationAlt:
        "主観1票・客観3票のパレットから付箋にシールを貼り、取り消すと残票が戻る",
    },
  ],
  "1-5": [
    {
      title: "話し合って、取り組む課題を1つ決めよう。",
      description: "票を参考に考えましょう。最多票を必ず選ぶ必要はありません。",
      illustration: "decision-purpose",
      illustrationAlt: "付箋上の主観票・客観票を参考に、チームで課題を話し合う",
    },
    {
      title: "「採用する付箋を選ぶ」から1枚選ぼう。",
      description:
        "ボタンを押してから付箋を選ぶと、チームの決定になります。決定後に次のフェーズへ進みましょう。",
      illustration: "decision",
      videoSrc: "/onboarding/step-1-5.webm",
      illustrationAlt:
        "票を比べ、採用する付箋を選ぶボタンを押してから1枚の付箋を選ぶ流れ",
    },
  ],
  "2-1": [
    {
      title: "困りごとを、改善方法を考える問いに変えよう。",
      description:
        "決めた課題を見て、「どうしたら私たちは、もっと〇〇できるだろう？」と考えましょう。",
      illustration: "question-purpose",
      illustrationAlt: "決めた課題から改善方法を考える問いへ",
    },
    {
      title: "「置き換える」「削除する」で、問いを広げよう。",
      description: "例の課題：忘れ物が多い。",
      illustration: "question-example",
      illustrationAlt:
        "忘れ物が多いという課題から、SCAMPERの置き換える・削除するで2つの問いを考える例",
    },
  ],
  "3-1": [
    {
      title: "決めた問いに答える解決策を、1枚に1つ書こう。",
      description: "どんな方法ならよくできそうか、思いつくまま考えましょう。",
      illustration: "solution-purpose",
      illustrationAlt: "決めた問いに対し、1枚に1つずつ解決策を考える",
    },
    {
      title: "問いをヒントに、解決策を考えてみよう。",
      description: "問い：どうしたら、記憶に頼らず持ち物を確認できるだろう？",
      illustration: "solution-example",
      illustrationAlt:
        "記憶に頼らず持ち物を確認する問いから、出発前に持ち物を知らせる仕組みを考える例",
    },
  ],
  "3-3": [
    {
      title: "価値と実現のしやすさで、解決策を比べよう。",
      description:
        "誰にどんな価値があるか、どのくらい実現しやすいかを話し合いましょう。",
      illustration: "evaluation-purpose",
      illustrationAlt: "解決策を価値と実現のしやすさの2つの観点で比べる",
    },
    {
      title: "付箋を動かし、みんなで位置を考えよう。",
      description:
        "価値が高いほど上、実現しやすいほど右に置きます。前の共有で置いた付箋の位置を見直せます。",
      illustration: "evaluation",
      videoSrc: "/onboarding/step-3-3.webm",
      illustrationAlt:
        "上ほど価値が高く、右ほど実現しやすい2軸マップで付箋を動かす",
    },
  ],
};

export function getStepGuideSlides(
  phaseKey: string,
): readonly StepGuideSlide[] {
  return STEP_GUIDES[phaseKey] ?? [];
}

export const SCAMPER_QUESTION_EXAMPLES = [
  {
    perspective: "置き換える",
    prompt: "頭で覚えることを、別の確認方法に置き換えられない？",
    question: "どうしたら、記憶に頼らず持ち物を確認できるだろう？",
  },
  {
    perspective: "削除する",
    prompt: "出発直前の準備をなくせない？",
    question: "どうしたら、出発前に慌てて準備せずに済むだろう？",
  },
] as const;

export const STEP_GUIDE_DIAGRAM_COPY = {
  timer: "タイマー",
  timeRule: "時間内に取り組もう",
  exchange: "自分の困りごと ↔ みんなの困りごと",
  morning: "朝の支度が大変",
  forgotten: "忘れ物が多い",
  tidying: "片づけが続かない",
  check: "持ち物を確認し忘れる",
  belongingsGroup: "持ち物の困りごと",
  privateNotes: "① マイ付箋",
  drag: "ドラッグ →",
  share: "② ボードへ出して説明",
  afterExplanation: "③ 説明が終わったら",
  nextSpeaker: "次の人へ",
  subjective: "● 主観",
  objective: "◆ 客観",
  subjectiveCriterion: "激しく共感する、取り組みたい",
  objectiveCriterion: "自分以外の人にも価値がありそう",
  palette: "パレット（シールの置き場）",
  subjectiveRemaining: "● 主観 残り1票 → 0票",
  objectiveRemaining: "◆ 客観 残り3票 → 2票",
  attach: "貼る →",
  returnSticker: "← 戻す",
  cancelVote: "自分のシールを押す／戻す → 取り消した分の残票が戻る",
  firstVotes: "主観 2票 ・ 客観 1票",
  secondVotes: "主観 1票 ・ 客観 2票",
  startDecision: "① 採用する付箋を選ぶ",
  selectNote: "② 付箋を選ぶ",
  discuss: "票を参考に、話し合って1つ決める",
  decidedIssue: "決めた課題",
  questionTemplate: "どうしたら私たちは、もっと〇〇できるだろう？",
  exampleIssue: "課題：忘れ物が多い",
  scamper:
    "SCAMPER法は7つの視点から発想を広げる方法。ここでは「置き換える」「削除する」の2つを、問いを広げるために応用しています。",
  decidedQuestion: "決めた問い",
  solutionA: "解決策 A",
  solutionB: "解決策 B",
  exampleQuestion: SCAMPER_QUESTION_EXAMPLES[0].question,
  solutionExampleLabel: "解決策の例",
  exampleSolution: "出発前に持ち物を知らせる仕組み。",
  solution: "解決策",
  valueQuestion: "価値：誰にどんな価値がある？",
  feasibilityQuestion: "実現のしやすさ：どのくらい実現しやすい？",
  valueAxis: "↑ 価値が高い",
  reposition: "↗ 位置を見直す",
  feasibilityAxis: "実現しやすい →",
} as const;
