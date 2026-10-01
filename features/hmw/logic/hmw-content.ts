// Step 2-1（HMW 個人執筆）の固定文言。
// テンプレート・具体例の真実は docs/product/sprint-flow.md「HMW入力の具体例」。
// その内容を保ち、付箋を自分の問いへ書き換える操作案内を併記する。

// 持ち越された決定課題の固定表示に付けるラベル。
export const DECIDED_ISSUE_LABEL = "決定した課題";

// 選ぶと入力の起点（付箋の書き出し）になる修飾語。
export const HMW_TEMPLATES = [
  "もっと簡単に",
  "もっと安心して",
  "もっと楽しく",
  "もっと短時間で",
  "もっと継続して",
] as const;

// お手本として並べて表示する、完成済みの HMW の例。
// テンプレートと並ぶもう一つの入力の起点。
export const HMW_EXAMPLES = [
  "小さいタスクを忘れずに取り組める？",
  "買い物を忘れずに安く買える？",
  "無駄遣いをなくして、お金を有効活用できる？",
] as const;

// テンプレートを自分の問いへ書き換えるための操作案内。
export const HMW_GUIDE_HEADING =
  "HMW = どうしたら私たちは、もっと〇〇できるだろう？";
export const HMW_TEMPLATE_DESCRIPTION =
  "選ぶとマイ付箋を1枚作ります。マイ付箋を開き、続きに自分の課題に合う問いを書こう。";
export const HMW_EXAMPLE_DESCRIPTION =
  "例の考え方を、決定した課題に置き換えてみよう。付箋には問いの本体だけを書きます。";
