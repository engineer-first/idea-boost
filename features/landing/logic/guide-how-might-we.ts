import type { Guide } from "./guide-types";

export const howMightWeGuide: Guide = {
  slug: "how-might-we",
  title: "HMW（How Might We）の問いの作り方と例文 | Idea Boost",
  heading: "HMW（How Might We）の問いの作り方：例文と、よい問いの確かめ方",
  description:
    "HMW（How Might We／どうしたら〜できる？）の問いの作り方を例文つきで解説。課題を問いに言い換える手順、広すぎ・狭すぎを避けるコツ、よい問いのチェックリスト、チームで1つ選ぶ方法まで。",
  summary:
    "HMW（How Might We）は、課題を「どうしたら〜できる？」という問いに言い換えて、アイデアを出す方向をチームでそろえる方法です。①誰の、どんな困りごとかを1文で書く、②望む状態を「どうしたら〜できる？」の形にする、③広すぎず狭すぎないか、解決策が入っていないかを確かめる、の順に作ります。",
  keywords: ["HMW 問い 作り方", "How Might We 例", "HMW とは"],
  datePublished: "2026-11-27",
  dateModified: "2026-11-27",
  sections: [
    {
      id: "what",
      heading: "HMW（How Might We）とは",
      blocks: [
        {
          kind: "paragraph",
          text: "HMWは「How Might We〜?（私たちはどうしたら〜できるだろう？）」の頭文字です。1970年代にP&Gで使われ始め、デザイン会社のIDEOが取り入れて広まりました。2012年のHarvard Business Reviewの記事では、Google・Facebook・IDEOで使われている言葉として紹介されています。",
        },
        {
          kind: "paragraph",
          text: "課題をそのまま見るとできない理由が目に入りますが、問いにすると「答えを探す」頭に切り替わります。チームで同じ問いに答えるので、出てくる案の方向もそろいます。",
        },
      ],
    },
    {
      id: "steps",
      heading: "HMWの問いの作り方：3つの手順",
      blocks: [
        {
          kind: "list",
          ordered: true,
          items: [
            "困りごとを1文で書く。誰が、どんな場面で、何に困っているかを入れる。",
            "その人が望む状態を考え、「どうしたら〜できる？」の形にする。",
            "広さを確かめる。目安として、案が5つ以上出せそうで、答えが1つに決まっていなければよい。",
          ],
        },
        {
          kind: "example",
          label: "例",
          items: [
            {
              label: "困りごと",
              text: "グループ課題の話し合いで、発言する人がいつも同じになる",
            },
            {
              label: "望む状態",
              text: "全員が自分の考えを出してから話し合える",
            },
            {
              label: "HMWの問い",
              text: "どうしたら全員が気軽に考えを出せる話し合いにできる？",
            },
          ],
        },
      ],
    },
    {
      id: "examples",
      heading: "HMWの例文",
      blocks: [
        {
          kind: "paragraph",
          text: "身近な困りごとを問いにした例です。どれも、答えになる案がいくつも考えられます。",
        },
        {
          kind: "table",
          caption: "困りごとと HMW の問いの例",
          head: ["困りごと", "HMWの問い"],
          rows: [
            [
              "部活に入った1年生が、すぐ来なくなってしまう",
              "どうしたら新入部員が最初の1か月を楽しく過ごせる？",
            ],
            [
              "チームの予定が合わず、話し合いが進まない",
              "どうしたら全員がそろわなくても話し合いを進められる？",
            ],
            [
              "授業中に分からないことを聞きづらい",
              "どうしたら授業中に分からないことを気軽に聞ける？",
            ],
            [
              "朝、着る服を選ぶのに時間がかかる",
              "どうしたら朝、迷わず服を選べる？",
            ],
            [
              "昼休みの学食が混んでいて食べる時間が短い",
              "どうしたら混んでいても昼食の時間をゆっくり取れる？",
            ],
          ],
        },
      ],
    },
    {
      id: "scope",
      heading: "広すぎる問い・狭すぎる問いを直す",
      blocks: [
        {
          kind: "paragraph",
          text: "問いが広すぎると、何を考えればよいか分からず案がぼやけます。狭すぎて解決策が入っていると、答えが1つに決まってしまいます。その間を探します。",
        },
        {
          kind: "example",
          label: "学食の混雑の例",
          items: [
            { label: "広すぎる", text: "どうしたら昼休みを良くできる？" },
            {
              label: "狭すぎる（案が入っている）",
              text: "どうしたら食券機を2台に増やせる？",
            },
            {
              label: "ちょうどよい",
              text: "どうしたら混んでいても昼食の時間をゆっくり取れる？",
            },
          ],
        },
        {
          kind: "paragraph",
          text: "広すぎるときは「誰の」「どの場面の」を足し、狭すぎるときは「なぜそれをしたいのか」を考えて、その目的を問いにします。",
        },
      ],
    },
    {
      id: "checklist",
      heading: "よい問いのチェックリスト",
      blocks: [
        {
          kind: "list",
          items: [
            "実際に見聞きした困りごとから作っている",
            "解決策が入っていない（「アプリを作る」「通知する」などの手段を書かない）",
            "望む状態を前向きな言葉で書いている（「減らす」「防ぐ」より「〜できる」）",
            "案が5つ以上出せそうな広さがある（目安）",
            "チームの全員が答えを考えてみたいと思える",
          ],
        },
      ],
    },
    {
      id: "mistakes",
      heading: "よくある間違いと直し方",
      blocks: [
        {
          kind: "table",
          caption: "よくある間違いと直し方",
          head: ["よくある間違い", "直し方"],
          rows: [
            [
              "どうしたら勉強アプリを作れる？（作るものが決まっている）",
              "そのアプリで誰の何を楽にしたいかを問いにする",
            ],
            [
              "どうしたら遅刻を防げる？（防ぐ・減らすの形）",
              "望む状態にする：どうしたら朝、余裕をもって家を出られる？",
            ],
            [
              "どうしたら授業も部活もバイトもうまくいく？（課題を詰め込む）",
              "1つの困りごとに絞り、問いを分ける",
            ],
            [
              "どうしたら世界から孤独をなくせる？（大きすぎる）",
              "身近な場面に寄せる：どうしたら転校してきた人がクラスで話しかけやすくなる？",
            ],
          ],
        },
      ],
    },
    {
      id: "choose",
      heading: "チームで問いを1つ選ぶ",
      blocks: [
        {
          kind: "list",
          ordered: true,
          items: [
            "同じ困りごとから、各自が一人で問いを2〜3個書く（5分）。",
            "順番に読み上げて共有し、似た問いはまとめる。",
            "「この問いなら答えを考えたい」と思うものに投票する。",
            "票の多い問いを見ながら話し、1つに決める。",
          ],
        },
        {
          kind: "paragraph",
          text: "一人で書いてから共有すると、最初に話した人の言い方に引っぱられず、いろいろな角度の問いが出ます。",
        },
      ],
    },
  ],
  faq: [
    {
      question: "HMWの「might」にはどんな意味がありますか？",
      answer:
        "「〜かもしれない」という含みがあり、正解が1つではなく、いろいろな答えがありうることを表します。日本語では「どうしたら〜できる？」と書くと使いやすくなります。",
    },
    {
      question: "問いはいくつ作ればよいですか？",
      answer:
        "チームで考えるなら、1人2〜3個ずつ出してから1つに絞るのがおすすめです。最初から1つに決めるより、言い方の違いからよい問いが見つかります。",
    },
    {
      question: "HMWの問いを作ったあとは何をしますか？",
      answer:
        "その問いに答えるアイデアを、まず一人で書き出してから共有して広げます。案がそろったら投票で絞り、話し合って1つに決めます。",
    },
  ],
  sources: [
    {
      label:
        "Nielsen Norman Group — Using “How Might We” Questions to Ideate on the Right Problems（英語）",
      url: "https://www.nngroup.com/articles/how-might-we-questions/",
    },
    {
      label: "IDEO Design Kit — How Might We（英語）",
      url: "https://www.designkit.org/methods/how-might-we.html",
    },
    {
      label:
        "Harvard Business Review — The Secret Phrase Top Innovators Use（英語）",
      url: "https://hbr.org/2012/09/the-secret-phrase-top-innovato",
    },
  ],
  related: ["brainstorming", "hackathon-idea", "design-sprint"],
};
