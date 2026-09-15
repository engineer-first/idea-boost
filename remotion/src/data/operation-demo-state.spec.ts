import { describe, expect, it } from "vitest";
import { OPERATION_DEMO_FPS } from "../timeline";
import {
  getOperationBoardData,
  getOperationMoment,
  getPrimaryDragPointer,
  PRIMARY_DRAG_SOURCE,
} from "./operation-demo-state";

const atSecond = (second: number) =>
  getOperationMoment(second * OPERATION_DEMO_FPS, OPERATION_DEMO_FPS);

describe("operation demo state adapter", () => {
  it("maps the opening states to home and lobby", () => {
    expect(atSecond(0).screen).toBe("home");
    expect(atSecond(6).screen).toBe("lobby");
  });

  it.each([
    [13, 1, 1],
    [21, 1, 2],
    [28, 1, 3],
    [35, 1, 4],
    [41, 1, 5],
    [48, 2, 1],
    [55, 2, 2],
    [60, 2, 3],
    [66, 2, 4],
    [73, 3, 1],
    [81, 3, 2],
    [88, 3, 3],
    [96, 3, 4],
    [102, 3, 5],
  ])("maps second %i to phase %i step %i", (second, phase, step) => {
    const moment = atSecond(second);
    expect(moment.screen).toBe("board");
    expect(moment.phase).toEqual({ kind: "step", phase, step });
  });

  it("opens vote results only on result steps", () => {
    expect(atSecond(41).showVoteResult).toBe(true);
    expect(atSecond(66).showVoteResult).toBe(true);
    expect(atSecond(102).showVoteResult).toBe(true);
    expect(atSecond(96).showVoteResult).toBe(false);
  });

  it("holds the completed sprint after the final decision", () => {
    const moment = atSecond(109);

    expect(moment.segmentId).toBe("complete");
    expect(moment.phase).toEqual({ kind: "step", phase: 3, step: 5 });
    expect(moment.decisionPhase).toBe(3);
    expect(moment.showVoteResult).toBe(false);
  });

  it("moves issue notes from the private toolbar to the shared board", () => {
    const writing = getOperationBoardData(atSecond(17));
    const sharingStart = getOperationBoardData(atSecond(21));
    const shared = getOperationBoardData(atSecond(26));

    expect(writing.privateNotes.length).toBeGreaterThan(0);
    expect(writing.notes).toHaveLength(0);
    expect(sharingStart.privateNotes).toHaveLength(1);
    expect(sharingStart.notes).toHaveLength(0);
    expect(shared.privateNotes).toHaveLength(0);
    expect(shared.notes.length).toBeGreaterThan(0);
  });

  it("starts every private-note share from its toolbar instead of the board", () => {
    const issueShare = getOperationBoardData(atSecond(21));
    const hmwShare = getOperationBoardData(atSecond(55));
    const ideaShare = getOperationBoardData(atSecond(81));

    expect(issueShare.privateNotes.map((note) => note.content)).toEqual([
      "小さいタスクを忘れてしまう",
    ]);
    expect(issueShare.notes).toHaveLength(0);
    expect(hmwShare.privateNotes.map((note) => note.content)).toEqual([
      "もっと簡単にタスクを見える化できる？",
    ]);
    expect(hmwShare.notes).toHaveLength(0);
    expect(ideaShare.privateNotes.map((note) => note.content)).toEqual([
      "今日やる小さなタスクだけを表示する",
    ]);
    expect(ideaShare.notes).toHaveLength(0);
  });

  it("groups issue notes before stealth voting", () => {
    const grouped = getOperationBoardData(atSecond(32));
    const voting = getOperationBoardData(atSecond(38));

    expect(grouped.groups).toHaveLength(1);
    expect(
      voting.notes.some((note) => note.dotVotes.objective.ownCount > 0),
    ).toBe(true);
    expect(
      voting.notes.every((note) => note.dotVotes.objective.count == null),
    ).toBe(true);
  });

  it("reveals vote counts on result steps and carries decisions forward", () => {
    const issueResult = getOperationBoardData(atSecond(44));
    const hmwWriting = getOperationBoardData(atSecond(51));
    const ideaWriting = getOperationBoardData(atSecond(76));

    expect(
      issueResult.notes.every((note) => note.dotVotes.objective.count != null),
    ).toBe(true);
    expect(hmwWriting.hmwDecidedIssue).toBeTruthy();
    expect(ideaWriting.decidedHmw).toBeTruthy();
  });

  it("uses map coordinates for ideas and completes with a phase 3 decision", () => {
    const mapped = getOperationBoardData(atSecond(92));
    const complete = getOperationBoardData(atSecond(114));

    expect(mapped.notes.every((note) => note.x >= 0 && note.x <= 100)).toBe(
      true,
    );
    expect(mapped.notes.every((note) => note.y >= 0 && note.y <= 100)).toBe(
      true,
    );
    expect(complete.decision?.phase).toBe(3);
  });

  it("shows named collaborators only during shared work", () => {
    const privateWriting = getOperationBoardData(atSecond(17));
    const sharing = getOperationBoardData(atSecond(24));
    const voting = getOperationBoardData(atSecond(38));

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
    const sharing = getOperationBoardData(atSecond(24));

    expect(
      sharing.remoteCursors.every((cursor) => cursor.draggingNoteId === null),
    ).toBe(true);
    expect(sharing.remoteNoteDrags).toHaveLength(0);
  });

  it("moves the dragged private note along the same path as the pointer", () => {
    const beforeDrag = getOperationBoardData(
      getOperationMoment(21.5 * OPERATION_DEMO_FPS, OPERATION_DEMO_FPS),
    );
    const handoff = getOperationBoardData(
      getOperationMoment(21 * OPERATION_DEMO_FPS + 34, OPERATION_DEMO_FPS),
    );
    const dragging = getOperationBoardData(atSecond(23));
    const released = getOperationBoardData(atSecond(26));

    expect(beforeDrag.privateNotes).toHaveLength(1);
    expect(beforeDrag.dragGhost).toBeNull();
    expect(handoff.dragGhost?.x).toBeGreaterThan(PRIMARY_DRAG_SOURCE.x - 20);
    expect(handoff.dragGhost?.y).toBeGreaterThan(PRIMARY_DRAG_SOURCE.y - 20);
    expect(dragging.dragGhost).not.toBeNull();
    expect(dragging.privateNotes).toHaveLength(0);
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
    const hmwDraggingMoment = atSecond(57);
    const hmwDragging = getOperationBoardData(hmwDraggingMoment);
    const ideaDraggingMoment = atSecond(83);
    const ideaDragging = getOperationBoardData(ideaDraggingMoment);

    expect(hmwDragging.dragGhost).not.toBeNull();
    expect(hmwDragging.privateNotes).toHaveLength(0);
    expect(getPrimaryDragPointer(hmwDraggingMoment)).not.toBeNull();
    expect(ideaDragging.viewportDragGhost).not.toBeNull();
    expect(ideaDragging.privateNotes).toHaveLength(0);
    expect(getPrimaryDragPointer(ideaDraggingMoment)).not.toBeNull();
  });

  it.each([
    [24, "board"],
    [31, "board"],
    [57, "board"],
    [84, "map"],
    [92, "map"],
  ] as const)("keeps collaborator cursors attached to moving notes at second %i", (second, surface) => {
    const data = getOperationBoardData(atSecond(second));

    for (const cursor of data.remoteCursors) {
      const note = data.notes.find(
        (candidate) => candidate.color === cursor.color,
      );
      if (!note) continue;
      if (surface === "board") {
        expect(cursor.x).toBeCloseTo(note.x + 20, 4);
        expect(cursor.y).toBeCloseTo(note.y + 20, 4);
      } else {
        expect(cursor.x).toBeCloseTo(note.x, 4);
        expect(cursor.y).toBeCloseTo(note.y, 4);
      }
    }
  });

  it("keeps evaluated idea positions when voting begins", () => {
    const evaluated = getOperationBoardData(atSecond(95.9));
    const voting = getOperationBoardData(atSecond(96));

    expect(voting.notes.map(({ x, y }) => ({ x, y }))).toEqual(
      evaluated.notes.map(({ x, y }) => ({ x, y })),
    );
  });

  it("uses the latest positioned vote stickers while voting", () => {
    const voting = getOperationBoardData(atSecond(38));
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
