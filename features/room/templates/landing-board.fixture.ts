import { buildNote } from "@/contracts/room-protocol.fixture";

// LP画像撮影専用の架空入力。掲載許可済み成果とは分けて管理する。
const ideas = [
  { content: "寝る準備を始める時刻に知らせる", x: 80, y: 82, color: "yellow" },
  { content: "作業中、一定間隔で時刻を知らせる", x: 50, y: 63, color: "blue" },
  {
    content: "寝る前にやることを順番に表示する",
    x: 80,
    y: 35,
    color: "pink",
  },
] as const;

export const landingBoardNotes = ideas.map((idea, index) =>
  buildNote({
    ...idea,
    id: `landing-idea-${index + 1}`,
    authorId: "11111111-1111-4111-8111-111111111111",
    fontSize: 24,
    stackOrder: index,
    // 投票中に表示するのは本人のシールだけ。架空の主観1票を貼った状態。
    ...(index === 0
      ? {
          dotVoteStickers: [
            {
              id: "cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa",
              kind: "subjective" as const,
              x: 0.85,
              y: 0.85,
            },
          ],
          dotVotes: {
            subjective: { count: 1, ownCount: 1, votedByMe: true },
            objective: { count: 0, ownCount: 0, votedByMe: false },
          },
        }
      : {}),
  }),
);
