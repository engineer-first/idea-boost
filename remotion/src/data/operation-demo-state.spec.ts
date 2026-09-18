import { describe, expect, it } from "vitest";
import { OPERATION_DEMO_FPS } from "../timeline";
import {
  getOperationBoardData,
  getOperationHelp,
  getOperationMoment,
  getPrimaryDragPointer,
  PRIMARY_DRAG_SOURCE,
} from "./operation-demo-state";

const atSecond = (second: number) =>
  getOperationMoment(second * OPERATION_DEMO_FPS, OPERATION_DEMO_FPS);

describe("operation demo state adapter", () => {
  it("個人ワークでは4枚の付箋を順番に書き起こす", () => {
    const typing = getOperationBoardData(atSecond(13.4));
    const almostDone = getOperationBoardData(atSecond(21.9));

    expect(typing.privateNotes).toHaveLength(1);
    expect(typing.privateNotes[0]?.content).toContain("▌");
    expect(almostDone.privateNotes).toHaveLength(4);
    expect(
      almostDone.privateNotes.every((note) => note.content.length > 4),
    ).toBe(true);
  });

  it("共有ステップでは4人が4枚ずつ書いた付箋を順番に公開する", () => {
    const sharing = getOperationBoardData(atSecond(23.5));
    const shared = getOperationBoardData(atSecond(29.9));

    expect(sharing.notes.length).toBeGreaterThan(0);
    expect(sharing.notes.length).toBeLessThan(16);
    expect(shared.notes).toHaveLength(16);
    expect(
      Object.values(
        shared.notes.reduce<Record<string, number>>((counts, note) => {
          counts[note.authorId] = (counts[note.authorId] ?? 0) + 1;
          return counts;
        }, {}),
      ),
    ).toEqual([4, 4, 4, 4]);
  });

  it.each([60, 90])("フェーズ%dの個人ワークも4枚を入力する", (second) => {
    expect(getOperationBoardData(atSecond(second)).privateNotes).toHaveLength(
      4,
    );
  });

  it("developのヒントを問いとアイデアの入力中に表示する", () => {
    expect(getOperationHelp(atSecond(56))).toEqual({
      kind: "hmw",
      isOpen: true,
      tab: "write",
    });
    expect(getOperationHelp(atSecond(83))).toEqual({
      kind: "idea",
      isOpen: true,
      tab: "write",
    });
    expect(getOperationHelp(atSecond(86))).toEqual({
      kind: "idea",
      isOpen: true,
      tab: "expand",
    });
    expect(getOperationHelp(atSecond(92))).toEqual({
      kind: "reference",
      isOpen: false,
      tab: "write",
    });
    expect(getOperationHelp(atSecond(108))).toEqual({
      kind: null,
      isOpen: false,
      tab: "write",
    });
  });
  it("maps the opening states to home and lobby", () => {
    expect(atSecond(0).screen).toBe("home");
    expect(atSecond(6).screen).toBe("lobby");
  });

  it.each([
    [13, 1, 1],
    [22, 1, 2],
    [30, 1, 3],
    [38, 1, 4],
    [45, 1, 5],
    [53, 2, 1],
    [61, 2, 2],
    [67, 2, 3],
    [74, 2, 4],
    [82, 3, 1],
    [91, 3, 2],
    [99, 3, 3],
    [108, 3, 4],
    [115, 3, 5],
  ])("maps second %i to phase %i step %i", (second, phase, step) => {
    const moment = atSecond(second);
    expect(moment.screen).toBe("board");
    expect(moment.phase).toEqual({ kind: "step", phase, step });
  });

  it("opens vote results only on result steps", () => {
    expect(atSecond(45).showVoteResult).toBe(true);
    expect(atSecond(74).showVoteResult).toBe(true);
    expect(atSecond(115).showVoteResult).toBe(true);
    expect(atSecond(108).showVoteResult).toBe(false);
  });

  it("holds the completed sprint after the final decision", () => {
    const moment = atSecond(123);

    expect(moment.segmentId).toBe("complete");
    expect(moment.phase).toEqual({ kind: "step", phase: 3, step: 5 });
    expect(moment.decisionPhase).toBe(3);
    expect(moment.showVoteResult).toBe(false);
  });

  it("moves issue notes from the private toolbar to the shared board", () => {
    const writing = getOperationBoardData(atSecond(17.5));
    const sharingStart = getOperationBoardData(atSecond(22));
    const shared = getOperationBoardData(atSecond(29.5));

    expect(writing.privateNotes.length).toBeGreaterThan(0);
    expect(writing.notes).toHaveLength(0);
    expect(sharingStart.privateNotes).toHaveLength(4);
    expect(sharingStart.notes).toHaveLength(0);
    expect(shared.privateNotes).toHaveLength(0);
    expect(shared.notes.length).toBeGreaterThan(0);
  });

  it("starts every private-note share from its toolbar instead of the board", () => {
    const issueShare = getOperationBoardData(atSecond(22));
    const hmwShare = getOperationBoardData(atSecond(61));
    const ideaShare = getOperationBoardData(atSecond(91));

    expect(issueShare.privateNotes).toHaveLength(4);
    expect(issueShare.privateNotes[0]?.content).toBe(
      "小さいタスクを忘れてしまう",
    );
    expect(issueShare.notes).toHaveLength(0);
    expect(hmwShare.privateNotes).toHaveLength(4);
    expect(hmwShare.privateNotes[0]?.content).toBe(
      "もっと簡単にタスクを見える化できる？",
    );
    expect(hmwShare.notes).toHaveLength(0);
    expect(ideaShare.privateNotes).toHaveLength(4);
    expect(ideaShare.privateNotes[0]?.content).toBe(
      "今日やる小さなタスクだけを表示する",
    );
    expect(ideaShare.notes).toHaveLength(0);
  });

  it("groups issue notes before stealth voting", () => {
    const grouped = getOperationBoardData(atSecond(34.57143));
    const voting = getOperationBoardData(atSecond(41.5));

    expect(grouped.groups).toHaveLength(3);
    expect(
      voting.notes.some((note) => note.dotVotes.objective.ownCount > 0),
    ).toBe(true);
    expect(
      voting.notes.every((note) => note.dotVotes.objective.count == null),
    ).toBe(true);
  });

  it("reveals vote counts on result steps and carries decisions forward", () => {
    const issueResult = getOperationBoardData(atSecond(48.42857));
    const hmwWriting = getOperationBoardData(atSecond(56.42857));
    const ideaWriting = getOperationBoardData(atSecond(85.375));

    expect(
      issueResult.notes.every((note) => note.dotVotes.objective.count != null),
    ).toBe(true);
    expect(hmwWriting.hmwDecidedIssue).toBeTruthy();
    expect(ideaWriting.decidedHmw).toBeTruthy();
  });

  it("uses map coordinates for ideas and completes with a phase 3 decision", () => {
    const mapped = getOperationBoardData(atSecond(103.5));
    const complete = getOperationBoardData(atSecond(128));

    expect(mapped.notes.every((note) => note.x >= 0 && note.x <= 100)).toBe(
      true,
    );
    expect(mapped.notes.every((note) => note.y >= 0 && note.y <= 100)).toBe(
      true,
    );
    expect(complete.decision?.phase).toBe(3);
  });

  it("shows named collaborators only during shared work", () => {
    const privateWriting = getOperationBoardData(atSecond(17.5));
    const sharing = getOperationBoardData(atSecond(25.42857));
    const voting = getOperationBoardData(atSecond(41.5));

    expect(privateWriting.remoteCursors).toHaveLength(0);
    expect(sharing.remoteCursors.map((cursor) => cursor.name)).toEqual([
      "Taro Yamada",
      "Hanako Sato",
      "Mei Suzuki",
    ]);
    expect(sharing.remoteCursors.every((cursor) => !cursor.isIdle)).toBe(true);
    expect(voting.remoteCursors).toHaveLength(0);
  });

  it("keeps collaborator cursors free of invented drag labels", () => {
    const sharing = getOperationBoardData(atSecond(25.42857));

    expect(
      sharing.remoteCursors.every((cursor) => cursor.draggingNoteId === null),
    ).toBe(true);
    expect(sharing.remoteNoteDrags).toHaveLength(0);
  });

  it("moves the dragged private note along the same path as the pointer", () => {
    const beforeDrag = getOperationBoardData(
      getOperationMoment(22.5 * OPERATION_DEMO_FPS, OPERATION_DEMO_FPS),
    );
    const handoff = getOperationBoardData(
      getOperationMoment(22 * OPERATION_DEMO_FPS + 39, OPERATION_DEMO_FPS),
    );
    const dragging = getOperationBoardData(atSecond(23.2));
    const released = getOperationBoardData(atSecond(29.5));

    expect(beforeDrag.privateNotes).toHaveLength(4);
    expect(beforeDrag.dragGhost).toBeNull();
    expect(handoff.dragGhost?.x).toBeGreaterThan(PRIMARY_DRAG_SOURCE.x - 40);
    expect(handoff.dragGhost?.y).toBeGreaterThan(PRIMARY_DRAG_SOURCE.y - 40);
    expect(dragging.dragGhost).not.toBeNull();
    expect(dragging.privateNotes).toHaveLength(3);
    expect(dragging.dragGhost?.x).toBeGreaterThan(250);
    expect(dragging.dragGhost?.y).toBeGreaterThan(220);
    expect(released.dragGhost).toBeNull();
    expect(
      released.notes.find(
        (note) => note.content === "小さいタスクを忘れてしまう",
      ),
    ).toMatchObject({
      x: 250,
      y: 220,
    });
  });

  it("publishes HMW and idea notes through visible drag ghosts", () => {
    const hmwDraggingMoment = atSecond(63.4);
    const hmwDragging = getOperationBoardData(hmwDraggingMoment);
    const ideaDraggingMoment = atSecond(94);
    const ideaDragging = getOperationBoardData(ideaDraggingMoment);

    expect(hmwDragging.dragGhost).not.toBeNull();
    expect(hmwDragging.privateNotes).toHaveLength(2);
    expect(getPrimaryDragPointer(hmwDraggingMoment)).not.toBeNull();
    expect(ideaDragging.viewportDragGhost).not.toBeNull();
    expect(ideaDragging.privateNotes).toHaveLength(2);
    expect(getPrimaryDragPointer(ideaDraggingMoment)).not.toBeNull();
  });

  it.each([
    [25.42857, "board"],
    [33.42857, "board"],
    [63.4, "board"],
    [94.42857, "map"],
    [103.7, "map"],
  ] as const)("keeps collaborator cursors attached to moving notes at second %i", (second, surface) => {
    const data = getOperationBoardData(atSecond(second));

    for (const cursor of data.remoteCursors) {
      const candidates = data.notes.filter(
        (note) => note.color === cursor.color,
      );
      expect(
        candidates.some((note) =>
          surface === "board"
            ? Math.abs(cursor.x - note.x - 20) < 0.0001 &&
              Math.abs(cursor.y - note.y - 20) < 0.0001
            : Math.abs(cursor.x - note.x) < 0.0001 &&
              Math.abs(cursor.y - note.y) < 0.0001,
        ),
      ).toBe(true);
    }
  });

  it("keeps evaluated idea positions when voting begins", () => {
    const evaluated = getOperationBoardData(atSecond(107.8875));
    const voting = getOperationBoardData(atSecond(108));

    expect(voting.notes.map(({ x, y }) => ({ x, y }))).toEqual(
      evaluated.notes.map(({ x, y }) => ({ x, y })),
    );
  });

  it("uses the latest positioned vote stickers while voting", () => {
    const voting = getOperationBoardData(atSecond(41.5));
    const stickers = voting.notes.flatMap((note) => note.dotVoteStickers);

    expect(stickers.length).toBeGreaterThan(0);
    expect(stickers.every((sticker) => sticker.x >= 0 && sticker.x <= 1)).toBe(
      true,
    );
    expect(stickers.every((sticker) => sticker.y >= 0 && sticker.y <= 1)).toBe(
      true,
    );
  });
});
