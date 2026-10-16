// features/ の import 依存を mermaid flowchart に変換するロジックのテスト。
// 実ファイルシステムには依存させず、import 抽出・実装ファイル判定・
// 図のレンダリングをそれぞれ検証する。生成図を安定して確認できるよう、
// 決定的（ソート済み・全文一致で固定）な出力も仕様に含める。
import { describe, expect, it } from "vitest";
import {
  buildFeatureDiagram,
  buildOverviewDiagram,
  extractImportPaths,
  isImplementationFile,
} from "./dependency-graph.mts";

describe("extractImportPaths", () => {
  it("単一行の import from を抽出する", () => {
    expect(
      extractImportPaths('import { NoteCard } from "./note-card";\n'),
    ).toEqual(["./note-card"]);
  });

  it("import type / 複数行 import / export from も抽出する", () => {
    const source = [
      'import type { Note } from "../logic/notes-reducer";',
      "import {",
      "  BOARD_HEIGHT,",
      "  BOARD_WIDTH,",
      '} from "@/contracts/board";',
      'export { StickyNote } from "./molecules/sticky-note";',
    ].join("\n");
    expect(extractImportPaths(source)).toEqual([
      "../logic/notes-reducer",
      "@/contracts/board",
      "./molecules/sticky-note",
    ]);
  });

  it("副作用 import（from なし）も抽出する", () => {
    expect(extractImportPaths('import "./globals.css";\n')).toEqual([
      "./globals.css",
    ]);
  });

  it("文字列リテラルやコメント内の from は拾わない", () => {
    const source = [
      '// import { fake } from "./comment";',
      "const s = 'from \"./string\"';",
    ].join("\n");
    expect(extractImportPaths(source)).toEqual([]);
  });
});

describe("isImplementationFile", () => {
  it.each([
    ["molecules/note-card.tsx", true],
    ["logic/notes-reducer.ts", true],
    ["index.ts", true],
    ["molecules/note-card.spec.tsx", false],
    ["molecules/note-card.stories.tsx", false],
    ["organisms/room-timer.fixture.ts", false],
  ])("%s -> %s", (path, expected) => {
    expect(isImplementationFile(path)).toBe(expected);
  });
});

describe("buildFeatureDiagram", () => {
  it("5 箱 feature を帯順（containers → templates → organisms → molecules → logic）の subgraph でレンダリングする", () => {
    const diagram = buildFeatureDiagram({
      name: "room",
      files: [
        {
          path: "index.ts",
          source: 'export { RoomBoard } from "./containers/room-board";\n',
        },
        {
          path: "containers/room-board.tsx",
          source:
            'import { RoomBoardView } from "../templates/room-board-view";',
        },
        {
          path: "templates/room-board-view.tsx",
          source: [
            'import { LeaveConfirmDialog } from "../molecules/leave-confirm-dialog";',
            'import { RoomTimer } from "../organisms/room-timer";',
            'import type { Member } from "../logic/room-reducer";',
          ].join("\n"),
        },
        { path: "organisms/room-timer.tsx", source: "" },
        { path: "molecules/leave-confirm-dialog.tsx", source: "" },
        { path: "logic/room-reducer.ts", source: "" },
      ],
    });
    expect(diagram).toBe(
      [
        "flowchart LR",
        '  index["index.ts"]',
        '  subgraph containers["containers/"]',
        '    containers_room_board["room-board"]',
        "  end",
        '  subgraph templates["templates/"]',
        '    templates_room_board_view["room-board-view"]',
        "  end",
        '  subgraph organisms["organisms/"]',
        '    organisms_room_timer["room-timer"]',
        "  end",
        '  subgraph molecules["molecules/"]',
        '    molecules_leave_confirm_dialog["leave-confirm-dialog"]',
        "  end",
        '  subgraph logic["logic/"]',
        '    logic_room_reducer["room-reducer"]',
        "  end",
        "  containers_room_board --> templates_room_board_view",
        "  index --> containers_room_board",
        "  templates_room_board_view --> logic_room_reducer",
        "  templates_room_board_view --> molecules_leave_confirm_dialog",
        "  templates_room_board_view --> organisms_room_timer",
        "",
      ].join("\n"),
    );
  });

  it("フラット feature は subgraph なしでレンダリングする", () => {
    const diagram = buildFeatureDiagram({
      name: "dot-vote",
      files: [
        {
          path: "index.ts",
          source: 'export { DotVoteButton } from "./dot-vote-button";\n',
        },
        { path: "dot-vote-button.tsx", source: "" },
      ],
    });
    expect(diagram).toBe(
      [
        "flowchart LR",
        '  dot_vote_button["dot-vote-button"]',
        '  index["index.ts"]',
        "  index --> dot_vote_button",
        "",
      ].join("\n"),
    );
  });

  it("spec / stories / fixture はノードにもエッジにも含めない", () => {
    const diagram = buildFeatureDiagram({
      name: "notes",
      files: [
        { path: "molecules/note-card.tsx", source: "" },
        {
          path: "molecules/note-card.spec.tsx",
          source: 'import { NoteCard } from "./note-card";',
        },
      ],
    });
    expect(diagram).not.toContain("spec");
    expect(diagram).toContain('molecules_note_card["note-card"]');
  });

  it("解決できない相対 import はエッジを作らない", () => {
    const diagram = buildFeatureDiagram({
      name: "notes",
      files: [
        {
          path: "molecules/note-card.tsx",
          source: 'import { Gone } from "./deleted-file";',
        },
      ],
    });
    expect(diagram).not.toContain("-->");
  });

  it("contracts / lib / components への import は図に含めない", () => {
    const diagram = buildFeatureDiagram({
      name: "invite",
      files: [
        {
          path: "molecules/copy-invite-button.tsx",
          source: [
            'import { Button } from "@/components/ui/button";',
            'import { notify } from "@/lib/notify";',
            'import { InviteCode } from "@/contracts/invite";',
          ].join("\n"),
        },
      ],
    });
    expect(diagram).not.toContain("-->");
    expect(diagram).not.toContain("contracts");
  });
});

describe("buildOverviewDiagram", () => {
  it("app と feature 間の依存を集約してレンダリングする", () => {
    const diagram = buildOverviewDiagram(
      [
        {
          name: "room",
          files: [
            {
              path: "containers/room-board.tsx",
              source: [
                'import { useRoomNotes } from "@/features/notes";',
                'import { NoteCard } from "@/features/notes";',
              ].join("\n"),
            },
          ],
        },
        {
          name: "notes",
          files: [
            {
              path: "molecules/note-card.tsx",
              source: 'import { DotVoteControls } from "@/features/dot-vote";',
            },
          ],
        },
        { name: "dot-vote", files: [] },
      ],
      [
        {
          path: "app/rooms/[id]/page.tsx",
          source: 'import { RoomBoard } from "@/features/room";',
        },
      ],
    );
    expect(diagram).toBe(
      [
        "flowchart LR",
        '  app["app/"]',
        '  dot_vote["dot-vote"]',
        '  notes["notes"]',
        '  room["room"]',
        "  app --> room",
        "  notes --> dot_vote",
        "  room --> notes",
        "",
      ].join("\n"),
    );
  });
});
