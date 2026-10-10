// visibleTo のテーブル駆動テスト。
// フェーズ・ロールの分岐を visibility.ts に追加するときは、このテーブルに
// 必ず対応する行を足す（分岐がテーブルにないままのマージはレビューで差し戻す）。
import { describe, expect, it } from "vitest";
import { buildPhaseStep } from "../contracts/phase.fixture";
import type { ProtocolNote } from "../contracts/room-protocol";
import { filterVisible, projectNoteForViewer, visibleTo } from "./visibility";

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";

function note(overrides?: Partial<ProtocolNote>): ProtocolNote {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    authorId: AUTHOR,
    content: "メモ",
    contentRevision: 0,
    visibility: "shared",
    excluded: false,
    color: "yellow",
    x: 100,
    y: 100,
    createdAt: "2026-07-07T00:00:00.000Z",
    updatedAt: "2026-07-07T00:00:00.000Z",
    dotVotes: {
      subjective: { count: 0, votedByMe: false, ownCount: 0 },
      objective: { count: 0, votedByMe: false, ownCount: 0 },
    },
    ...overrides,
    fontSize: overrides?.fontSize ?? 14,
    stackOrder: overrides?.stackOrder ?? 0,
    dotVoteStickers: overrides?.dotVoteStickers ?? [],
  };
}

// フェーズ概念の導入時に { phase, viewer, note作者, expected } の形へ拡張する。
const OUTCOME_VIEWER = "00000000-0000-0000-0000-000000000000";

// 本人向け再訪もNULL_VIEWERで捕捉した共有盤面のみを使用する。本人の未共有本文も含めない。
const TABLE: Array<{
  name: string;
  viewerId: string;
  note: ProtocolNote;
  expected: boolean;
}> = [
  {
    name: "AT-538 連続作成したprivate付箋を他の参加者へ配信しない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "AT-538 連続作成したprivate付箋を作者の別タブにも配信する",
    viewerId: AUTHOR,
    note: note({ visibility: "private" }),
    expected: true,
  },
  {
    name: "AT-014 未確定の共有previewは他者に不可視",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "AT-014 有効drop確定後にsharedが他者へ可視",
    viewerId: VIEWER,
    note: note({ visibility: "shared" }),
    expected: true,
  },
  {
    name: "AT-015 戻し先hoverだけではsharedを他者から消さない",
    viewerId: VIEWER,
    note: note({ visibility: "shared" }),
    expected: true,
  },

  {
    name: "peer途中移動も他者private付箋を可視にしない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "peer途中移動のshared対象は他参加者にも可視",
    viewerId: VIEWER,
    note: note({ visibility: "shared" }),
    expected: true,
  },
  {
    name: "メンバー除外後もホストに他者の未共有付箋を公開しない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "除外メンバーの共有付箋は他の参加者の盤面に残す",
    viewerId: VIEWER,
    note: note({ visibility: "shared" }),
    expected: true,
  },
  {
    name: "成果を残して退出した作者も再訪記録では本人のprivate付箋を見られない",
    viewerId: OUTCOME_VIEWER,
    note: note({ visibility: "private", authorId: AUTHOR }),
    expected: false,
  },
  {
    name: "ホストを引き継いでも他者の未共有付箋を見せない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "マップ外カーソルの共有でも他者のprivate付箋は見られない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "移動した候補外も他の参加者へ共有する",
    viewerId: VIEWER,
    note: note({
      excluded: true,
      x: 70,
      y: 60,
      exclusionOperationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    }),
    expected: true,
  },
  {
    name: "移動の拒否後も他者の未共有付箋を見せない",
    viewerId: VIEWER,
    note: note({ visibility: "private", x: 70, y: 60 }),
    expected: false,
  },

  {
    name: "確定取消で保持した下書きは作者本人だけに見える",
    viewerId: AUTHOR,
    note: note({ visibility: "private" }),
    expected: true,
  },
  {
    name: "確定取消で保持した下書きを他の参加者へ出さない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "確定取消後も共有された候補外の付箋は全員に見える",
    viewerId: VIEWER,
    note: note({ excluded: true }),
    expected: true,
  },
  {
    name: "完了時閲覧者も作者本人のprivate付箋を再訪記録で見られない",
    viewerId: OUTCOME_VIEWER,
    note: note({ visibility: "private", authorId: AUTHOR }),
    expected: false,
  },
  {
    // 意見権限はD1の閲覧API専用。GUI/CLIの付与経路は可視性に渡さない。
    name: "GUI・CLIで付与した意見の閲覧者にもprivate付箋を公開しない",
    viewerId: OUTCOME_VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "成果閲覧者はprivate付箋を見られない",
    viewerId: OUTCOME_VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "成果閲覧者はshared付箋だけを見られる",
    viewerId: OUTCOME_VIEWER,
    note: note({ visibility: "shared" }),
    expected: true,
  },
  {
    name: "private: 作者本人は自分の付箋を見られる",
    viewerId: AUTHOR,
    note: note({ visibility: "private" }),
    expected: true,
  },
  {
    name: "private: 他のメンバーは付箋を見られない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "発表者本人の完了権限でも他者のprivate付箋は見られない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "共有のホストでも他者のprivate付箋は見られない",
    viewerId: VIEWER,
    note: note({ visibility: "private" }),
    expected: false,
  },
  {
    name: "shared: 他のメンバーも付箋を見られる",
    viewerId: VIEWER,
    note: note({ visibility: "shared" }),
    expected: true,
  },
];

describe("visibleTo", () => {
  for (const row of TABLE) {
    it(row.name, () => {
      expect(visibleTo({ viewerId: row.viewerId }, row.note)).toBe(
        row.expected,
      );
    });
  }
});

describe("filterVisible", () => {
  it("visibleTo の判定でスナップショットを絞り込む", () => {
    const notes = [note({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })];
    expect(filterVisible({ viewerId: VIEWER }, notes)).toEqual(notes);
  });
});

describe("projectNoteForViewer", () => {
  it.each([
    ["step 1-1", buildPhaseStep(1)],
    ["step 1-2", buildPhaseStep(2)],
    ["step 1-5", buildPhaseStep(5)],
    ["step 2-1 再執筆", buildPhaseStep(1, 2)],
    ["step 2-4 決定", buildPhaseStep(4, 2)],
    ["step 3-1 再執筆", buildPhaseStep(1, 3)],
    ["step 3-5 決定", buildPhaseStep(5, 3)],
  ])("%s では投票集計を保持する", (_name, phase) => {
    const source = note({
      dotVotes: {
        subjective: { count: 2, votedByMe: true, ownCount: 1 },
        objective: { count: 4, votedByMe: false, ownCount: 0 },
      },
    });

    expect(projectNoteForViewer({ viewerId: VIEWER, phase }, source)).toEqual(
      source,
    );
  });

  it.each([
    buildPhaseStep(4),
    buildPhaseStep(3, 2),
    buildPhaseStep(4, 3),
  ])("初回・再投票ステップ %j では集計を除去し本人票だけを保持する", (phase) => {
    const source = note({
      dotVotes: {
        subjective: { count: 2, votedByMe: true, ownCount: 1 },
        objective: { count: 4, votedByMe: false, ownCount: 0 },
      },
    });

    const projected = projectNoteForViewer({ viewerId: VIEWER, phase }, source);

    expect(projected.dotVotes).toEqual({
      subjective: { votedByMe: true, ownCount: 1 },
      objective: { votedByMe: false, ownCount: 0 },
    });
    expect(source.dotVotes.subjective.count).toBe(2);
    expect(source.dotVotes.objective.count).toBe(4);
  });
});

import { vi } from "vitest";
// 可視性が許可されても認証期限切れの受信者へは本文を送らない。
import { RoomBroadcaster } from "./room/broadcast";

it.each([
  "direct",
  "note",
  "group",
  "move-ended",
  "move-preview",
  "move-batch",
  "user",
  "broadcast",
  "all",
  "except",
])("期限切れの%s配信を拒否し有効接続へ継続する", (route) => {
  const now = Math.floor(Date.now() / 1000);
  const socket = (exp: number) => ({
    readyState: WebSocket.OPEN,
    deserializeAttachment: () => ({ userId: AUTHOR, sessionExpiresAt: exp }),
    send: vi.fn(),
    close: vi.fn(),
  });
  const expired = socket(now);
  const valid = socket(now + 60);
  const broadcaster = new RoomBroadcaster({
    getWebSockets: () => [expired, valid] as unknown as WebSocket[],
  });
  const subject = note();
  const update = { type: "note:updated" as const, note: subject };
  const peer = {} as WebSocket;
  switch (route) {
    case "direct":
      broadcaster.sendTo(expired as unknown as WebSocket, update);
      broadcaster.sendTo(valid as unknown as WebSocket, update);
      break;
    case "note":
      broadcaster.broadcastNote(() => update);
      break;
    case "group":
      broadcaster.broadcastGroup(
        { type: "group:deleted", groupId: "group", groupRevision: 1 },
        () => true,
      );
      break;
    case "move-ended":
      broadcaster.broadcastMoveEnded("op", () => true);
      break;
    case "move-preview":
      broadcaster.broadcastMovePreview(
        {
          type: "notes:move-preview",
          userId: AUTHOR,
          operationId: "op",
          phaseRevision: 1,
          sequence: 1,
          leaseMs: 1000,
          positions: [],
        },
        [subject],
        () => true,
        peer,
      );
      break;
    case "move-batch":
      broadcaster.broadcastMoveBatch(() => ({
        type: "notes:moved",
        notes: [subject],
        groups: [],
        groupRevision: 0,
        mapRevision: 0,
      }));
      break;
    case "user":
      broadcaster.broadcastNoteToUser(AUTHOR, () => update);
      break;
    case "broadcast":
      broadcaster.broadcast(update, subject);
      break;
    case "all":
      broadcaster.broadcastToAll(update);
      break;
    case "except":
      broadcaster.broadcastToAllExcept(update, VIEWER);
      break;
  }
  expect(expired.send).not.toHaveBeenCalled();
  expect(expired.close).toHaveBeenCalledWith(4002, "authentication required");
  expect(valid.send).toHaveBeenCalledOnce();
});
