// contracts 型（ProtocolNote / ProtocolMember）を組み立てる spec / stories 共有の
// テストデータビルダー。スキーマと同じ場所に置くことで、複数の feature と
// contracts 自身の spec が同じ既定値を共有し、レイヤー間の逆流 import
// （かつて contracts/grouping.spec.ts が components の fixture に依存していた）を防ぐ。
// 本番コードからは import しない（テスト・カタログ専用）。
import type {
  Carryover,
  Decision,
  NoteColor,
  ProtocolGroup,
  ProtocolMember,
  ProtocolNote,
} from "./room-protocol";

export function buildDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    phase: 1,
    noteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    decidedBy: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

export function buildCarryover(overrides: Partial<Carryover> = {}): Carryover {
  return {
    phase: 1,
    noteId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    content: "宿題を後回しにしてしまう",
    ...overrides,
  };
}

export function buildNote(overrides: Partial<ProtocolNote> = {}): ProtocolNote {
  return {
    id: "note-1",
    authorId: "user-1",
    content: "付箋の本文",
    visibility: "shared",
    color: "yellow",
    x: 100,
    y: 120,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    dotVotes: {
      subjective: { count: 0, votedByMe: false, ownCount: 0 },
      objective: { count: 0, votedByMe: false, ownCount: 0 },
    },
    dotVoteStickers: [],
    ...overrides,
  };
}

// 位置をずらした複数枚の付箋。ボード系の spec / stories で使う。
export function buildNotes(count = 3): ProtocolNote[] {
  return Array.from({ length: count }, (_, index) =>
    buildNote({
      id: `note-${index + 1}`,
      content: `付箋 ${index + 1}`,
      x: 80 + index * 40,
      y: 60 + index * 40,
    }),
  );
}

// 永続グループ（group:updated / snapshot が運ぶワイヤ上の形。
// PersistentGroup + createdAt / updatedAt）。既定値は buildNote と同じく
// 読みやすい非 uuid 値にする（spec は zod 検証を通さないため）。
export function buildGroup(
  overrides: Partial<ProtocolGroup> = {},
): ProtocolGroup {
  return {
    id: "group-1",
    name: "グループ",
    noteIds: ["note-1", "note-2"],
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

const MEMBER_COLORS: NoteColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
  "purple",
];

// 実際の name は英語のファースト/ラスト形式（Google ログインの表示名を想定）。
const MEMBER_NAMES = [
  "Yuki Tanaka",
  "Taro Yamada",
  "Hanako Sato",
  "Jiro Suzuki",
  "Saburo Kato",
  "Shiro Watanabe",
  "Goro Ito",
  "Hiroko Aoki",
];

export function buildMembers(
  count: number,
  currentUserId?: string,
): ProtocolMember[] {
  return Array.from({ length: count }, (_, index) => {
    // 1 番目（index=0）を currentUserId にすると「自分判定」のテストが楽。
    // currentUserId を指定しない場合は機械的に振る。
    const userId =
      currentUserId && index === 0
        ? currentUserId
        : makeUuid(index, currentUserId);
    return {
      userId,
      name: MEMBER_NAMES[index] ?? `Member ${index + 1}`,
      color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    };
  });
}

// currentUserId 以外の ID を生成する（currentUserId が先頭に置かれるので
// index=1 以降が衝突しないようにする）。
function makeUuid(index: number, currentUserId?: string): string {
  if (index === 0 && currentUserId) return currentUserId;
  // 固定の UUID っぽい文字列を返す（テスト間の安定性のため）。
  return `${index.toString().padStart(8, "0")}0000-4000-8000-0000-000000000000`;
}
