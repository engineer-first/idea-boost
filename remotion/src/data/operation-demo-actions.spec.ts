import { describe, expect, it } from "vitest";
import { getOperationTimeline } from "../timeline";
import {
  getOperationBoardData,
  getOperationMoment,
  getPrimaryDragPointer,
} from "./operation-demo-state";

function sample(id: string, progress: number) {
  const segment = getOperationTimeline().find((entry) => entry.id === id);
  if (!segment) throw new Error(`Unknown segment: ${id}`);
  return getOperationMoment(
    segment.from + Math.round(progress * (segment.durationInFrames - 1)),
  );
}

describe("デモで操作を省略せず見せる", () => {
  it.each([
    "phase-1-step-2",
    "phase-2-step-2",
    "phase-3-step-2",
  ])("%sでは自分の4枚すべてを個別に掴んでから共有する", (id) => {
    const initial = getOperationBoardData(sample(id, 0));
    const dragged = new Set<string>();
    let previous = initial;
    for (let frame = 0; frame <= 1000; frame++) {
      const moment = sample(id, frame / 1000);
      const current = getOperationBoardData(moment);
      const ghost = current.dragGhost ?? current.viewportDragGhost;
      if (ghost) {
        dragged.add(ghost.note.id);
        expect(getPrimaryDragPointer(moment)).not.toBeNull();
      }
      for (const note of previous.privateNotes) {
        if (!current.privateNotes.some((next) => next.id === note.id)) {
          expect(ghost?.note.id).toBe(note.id);
        }
      }
      previous = current;
    }
    expect([...dragged].sort()).toEqual(
      initial.privateNotes.map((note) => note.id).sort(),
    );
    expect(previous.privateNotes).toHaveLength(0);
    expect(previous.notes).toHaveLength(16);
  });

  it("課題を複数の名前付きグループへ分け、投票にも引き継ぐ", () => {
    const start = getOperationBoardData(sample("phase-1-step-3", 0));
    const end = getOperationBoardData(sample("phase-1-step-3", 1));
    const voting = getOperationBoardData(sample("phase-1-step-4", 0));
    expect(start.groups).toHaveLength(0);
    expect(end.groups.length).toBeGreaterThanOrEqual(3);
    expect(new Set(end.groups.map((group) => group.name)).size).toBe(
      end.groups.length,
    );
    expect(end.groups.every((group) => group.noteIds.length >= 2)).toBe(true);
    expect(new Set(end.groups.flatMap((group) => group.noteIds)).size).toBe(16);
    expect(voting.groups).toEqual(end.groups);
    expect(voting.notes.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
      end.notes.map(({ id, x, y }) => ({ id, x, y })),
    );
  });

  it.each([
    "phase-1-step-4",
    "phase-2-step-3",
    "phase-3-step-4",
  ])("%sは未投票で始まり、主観・客観シールを1票ずつ貼る", (id) => {
    let previousCount = 0;
    const start = getOperationBoardData(sample(id, 0));
    expect(start.notes.flatMap((note) => note.dotVoteStickers)).toHaveLength(0);
    expect(
      start.notes.every(
        (note) =>
          note.dotVotes.subjective.ownCount === 0 &&
          note.dotVotes.objective.ownCount === 0,
      ),
    ).toBe(true);
    for (let frame = 1; frame <= 1000; frame++) {
      const current = getOperationBoardData(sample(id, frame / 1000));
      const count = current.notes.flatMap(
        (note) => note.dotVoteStickers,
      ).length;
      expect(count - previousCount).toBeLessThanOrEqual(1);
      expect(count).toBeGreaterThanOrEqual(previousCount);
      expect(
        current.notes.every((note) => note.dotVotes.objective.count == null),
      ).toBe(true);
      previousCount = count;
    }
    expect(previousCount).toBe(4);
  });
});
