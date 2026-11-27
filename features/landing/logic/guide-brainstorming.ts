import type { Guide } from "./guide-types";

export const brainstormingGuide: Guide = {
  slug: "brainstorming",
  title: "ブレインストーミングのやり方とコツ | Idea Boost",
  heading: "ブレインストーミングのやり方とコツ：黙って書いてから話す",
  description:
    "ブレインストーミング（ブレスト）のやり方を解説。話しながら出すと案が減る理由と、一人で黙って書いてから共有する進め方、案が出ないときのコツまで、チームで案を出し切る方法をまとめました。",
  summary:
    "ブレインストーミングは、批判せずに量を出すチームのアイデア出しです。ただし、話しながら出し合うと、発言の順番待ちで案が減ることが研究で知られています。まず一人で黙って書き、そのあと順番に共有して乗っかり合うと、全員の案を出し切れます。",
  keywords: [
    "ブレインストーミング やり方",
    "ブレスト コツ",
    "ブレスト うまくいかない",
  ],
  datePublished: "2026-11-27",
  dateModified: "2026-11-27",
  sections: [
    {
      id: "rules",
      heading: "ブレインストーミングの4つのルール",
      blocks: [
        {
          kind: "paragraph",
          text: "ブレインストーミングは、広告会社のAlex Osbornが著書『Applied Imagination』（1953年）などで広めた方法です。次の4つのルールが知られています。",
        },
        {
          kind: "list",
          items: [
            "批判しない：出た案の良し悪しは、出し終わるまで言わない",
            "量を求める：質より数。たくさん出すほど良い案が混ざる",
            "自由に出す：突飛な案も歓迎する",
            "組み合わせる：ほかの人の案に乗っかり、つなげて広げる",
          ],
        },
      ],
    },
    {
      id: "why-fail",
      heading: "話しながらのブレストがうまくいかない理由",
      blocks: [
        {
          kind: "paragraph",
          text: "ルールを守っても、みんなで話しながら出し合うと、同じ人数が一人ずつ考えて合わせたときより案が少なくなることが、複数の研究をまとめた分析で示されています（Mullen, Johnson & Salas, 1991）。",
        },
        {
          kind: "list",
          items: [
            "順番待ち：誰かが話している間は話せず、その間に思いついた案を忘れる。Diehl & Stroebe（1987）は、これが案が減る主な原因だと示しました。",
          ],
        },
        {
          kind: "paragraph",
          text: "ほかに、変な案だと思われたくなくて出す前に引っ込めたり、先に出た案や声の大きい人の案に考えが寄ったりすることもあると言われます。",
        },
      ],
    },
    {
      id: "steps",
      heading: "黙って書いてから話す、ブレストの進め方",
      blocks: [
        {
          kind: "list",
          ordered: true,
          items: [
            "お題を「どうしたら〜できる？」の問いにして、全員に見える所に書く。",
            "話さずに、各自が付箋に1枚1案で書く。時間を区切り、良し悪しは考えない。",
            "一人ずつ付箋を出しながら説明する。質問はよいが、批判はしない。",
            "共有した案に乗っかり、組み合わせや別の切り口で案を足す。",
          ],
        },
        {
          kind: "paragraph",
          text: "一人で書く時間は、紙に書いてアイデアを出す「ブレインライティング」に近い考え方です。全員が同時に書けるので順番待ちがなく、話すのが苦手な人の案も同じだけ場に出ます。",
        },
      ],
    },
    {
      id: "tips",
      heading: "案が出ないときのコツ",
      blocks: [
        {
          kind: "list",
          items: [
            "お題を問いにする：「何か案ある？」より「どうしたら〜できる？」のほうが考え始めやすい",
            "切り口を変える：別の場面なら？ 別の人のためなら？ 逆にしたら？ ほかの分野ではどうしている？",
            "制限をつける：「お金をかけずに」「スマホを使わずに」など、あえて条件を足す",
            "時間を区切る：タイマーで区切ると、迷う前に書き出せる",
          ],
        },
      ],
    },
    {
      id: "next",
      heading: "出し終えたら",
      blocks: [
        {
          kind: "paragraph",
          text: "案を出し切ったら、話し合う前に、ほかの人の票を見ずに投票して絞ります。選び方は「アイデアの選び方」のガイドで紹介しています。",
        },
      ],
    },
  ],
  faq: [
    {
      question: "ブレインストーミングは何人でやるのがよいですか？",
      answer:
        "人数に決まりはありません。黙って書く時間をとる進め方なら、人数が多くても順番待ちが起きにくく、全員の案が出ます。",
    },
    {
      question: "オンラインでもブレストできますか？",
      answer:
        "はい。付箋を共有できるツールを使い、書く時間は各自の画面で、共有の時間は順番に画面を見せて進めます。Idea Boostなら、共有するまで付箋が自分にしか見えないので、黙って書く時間を作りやすくなります。",
    },
    {
      question: "ブレインライティングとは何ですか？",
      answer:
        "話す代わりに紙に書いてアイデアを出す方法です。シートを回して、前の人の案に書き足していきます。全員が同時に考えられるのが利点です。",
    },
  ],
  sources: [
    {
      label:
        "Mullen, Johnson & Salas (1991) Productivity Loss in Brainstorming Groups: A Meta-Analytic Integration（英語）",
      url: "https://doi.org/10.1207/s15324834basp1201_1",
    },
    {
      label:
        "Diehl & Stroebe (1987) Productivity loss in brainstorming groups（英語）",
      url: "https://doi.org/10.1037/0022-3514.53.3.497",
    },
    {
      label:
        "Osborn, A. F. Applied Imagination（1957年版・Internet Archive・英語）",
      url: "https://archive.org/details/appliedimaginati00osbo",
    },
  ],
  related: ["how-might-we", "hackathon-idea"],
};
