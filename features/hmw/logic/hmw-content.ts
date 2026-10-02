// Step 2-1（問いの個人執筆）の固定文言。
// テンプレート・具体例の真実は docs/product/sprint-flow.md「問い入力の具体例」。
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

// Step 2-1 の開始時にマイ付箋へ追加する、完成済みの問いの例。
export const HMW_EXAMPLES = [
  "（例）どうすれば、小さいタスクを忘れずに取り組めるだろう？",
  "（例）どうすれば、買い物を忘れずに安くできるだろう？",
] as const;

// テンプレートを自分の問いへ書き換えるための操作案内。
export const HMW_GUIDE_HEADING = "どうしたら私たちは、もっと〇〇できるだろう？";
export const HMW_TEMPLATE_DESCRIPTION =
  "選ぶとマイ付箋を1枚作ります。マイ付箋を開き、続きに自分の課題に合う問いを書こう。";
