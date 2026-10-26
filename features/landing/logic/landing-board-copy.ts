// LPの説明用モック。撮影用fixtureにあった架空の題材を引き継ぐ。
export const landingMembers = [
  { name: "ゆい", initial: "ゆ", color: "yellow" },
  { name: "たくみ", initial: "た", color: "blue" },
  { name: "さき", initial: "さ", color: "pink" },
] as const;

export const landingBoardCopy = {
  header: "③ アイデア ｜ 発想",
  next: "次のステップへ",
  room: "睡眠のアイデア",
  timer: "03:00",
  subjective: "主観",
  objective: "客観",
  issueLabel: "まずは、身近な困りごとから",
  hero: [
    { text: "寝る準備を始める時刻に知らせる", member: 0 },
    { text: "作業中、時刻を知らせる", member: 1 },
    { text: "翌朝の予定から逆算する", member: 1 },
    { text: "夜の予定を見える化する", member: 2 },
  ],
  issue: [
    "寝る時間が日によって違う",
    "作業に集中して時間を忘れる",
    "朝の準備が間に合わない",
  ],
  private: [
    "自分だけのスペース",
    "共有スペース",
    "作業に集中して時間を忘れる",
    "寝る時間が日によって違う",
  ],
  vote: [
    "自分の投票",
    "他の人の票は非表示",
    "寝る準備を始める時刻に知らせる",
    "作業中、時刻を知らせる",
  ],
} as const;
