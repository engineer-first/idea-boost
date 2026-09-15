export type IdeaSupportType = "osborn" | "scamper" | "reverse" | "industry";

export type IdeaSupportContent = {
  id: IdeaSupportType;
  label: string;
  title: string;
  content: string[];
};

export const ideaSupportContents: IdeaSupportContent[] = [
  {
    id: "osborn",
    label: "オズボーン",
    title: "オズボーンのチェックリスト",
    content: [
      "別の目的や用途で使えないか？",
      "似たものから応用できないか？",
      "形・仕組み・方法を変更できないか？",
      "大きくしたら新しい価値が生まれないか？",
      "小さくしたら使いやすくならないか？",
      "別のものに置き換えられないか？",
      "反対にしたら新しい発想にならないか？",
      "複数のアイデアを組み合わせられないか？",
    ],
  },

  {
    id: "scamper",
    label: "SCAMPER",
    title: "SCAMPER法",
    content: [
      "Substitute（置き換える）：別のものに変えられないか？",
      "Combine（組み合わせる）：他の要素と組み合わせられないか？",
      "Adapt（応用する）：別の場面の方法を使えないか？",
      "Modify（変更する）：形や仕組みを変えられないか？",
      "Put to another use（別用途）：違う目的で使えないか？",
      "Eliminate（削除する）：なくしても成立しないか？",
      "Reverse（逆転する）：順番や役割を逆にできないか？",
    ],
  },

  {
    id: "reverse",
    label: "逆転発想",
    title: "逆転発想で考える",
    content: [
      "理想とは反対の悪い状態をあえて考えてみる",
      "普通とは逆の方法にするとどうなるか考える",
      "利用する人と提供する人の役割を逆にしてみる",
    ],
  },

  {
    id: "industry",
    label: "他業界事例",
    title: "他業界からヒントを探す",
    content: [
      "飲食業界では同じ課題をどう解決しているか？",
      "ゲーム業界では楽しく続ける工夫をどうしているか？",
      "ホテル業界では快適な体験をどう作っているか？",
      "教育業界では学びや理解をどう支援しているか？",
    ],
  },
];
