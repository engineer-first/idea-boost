import { describe, expect, it } from "vitest";
import { snap } from "./launch-motion";
import {
  getLaunchState,
  LAUNCH_DURATION_FRAMES,
  LAUNCH_SCENES,
} from "./launch-state";

describe("Launch Video の観測可能な状態", () => {
  it("12場面を指定順で2520フレームに収める", () => {
    expect(LAUNCH_DURATION_FRAMES).toBe(2520);
    expect(LAUNCH_SCENES.map(({ id }) => id)).toEqual([
      "blank",
      "problems",
      "brand",
      "room",
      "flow",
      "private",
      "share",
      "hints",
      "map",
      "vote",
      "decision",
      "closing",
    ]);
    expect(getLaunchState(2519).scene.id).toBe("closing");
    for (const scene of LAUNCH_SCENES) {
      expect(getLaunchState(scene.from).scene.id).toBe(scene.id);
    }
  });
  it("個人作業とドラッグ中には本人の付箋を共有しない", () => {
    expect(getLaunchState(17 * 60).board.notes).toHaveLength(0);
    expect(getLaunchState(17 * 60).board.privateNotes[0].visibility).toBe(
      "private",
    );
    const during = getLaunchState(18 * 60 + 40);
    expect(
      during.board.notes.some((note) => note.authorId === during.currentUserId),
    ).toBe(false);
    const after = getLaunchState(20 * 60);
    expect(
      after.board.notes.some(
        (note) =>
          note.authorId === after.currentUserId && note.visibility === "shared",
      ),
    ).toBe(true);
  });
  it("投票中は自分の赤1票と青3票だけ、他者カーソル・集計は非公開", () => {
    const state = getLaunchState(32 * 60 + 45);
    expect(state.board.remoteCursors).toEqual([]);
    expect(
      state.board.notes.reduce(
        (n, note) => n + note.dotVotes.subjective.ownCount,
        0,
      ),
    ).toBe(1);
    expect(
      state.board.notes.reduce(
        (n, note) => n + note.dotVotes.objective.ownCount,
        0,
      ),
    ).toBe(3);
    for (const note of state.board.notes) {
      expect(note.dotVotes.subjective.count).toBeUndefined();
      expect(note.dotVotes.objective.count).toBeUndefined();
    }
    expect(
      getLaunchState(33 * 60 + 40).board.notes[0].dotVotes.subjective.count,
    ).toBe(2);
  });
  it("集計結果が出ても採用操作前には決定しない", () => {
    expect(getLaunchState(35 * 60).board.decision).toBeNull();
    expect(getLaunchState(37 * 60).board.decision?.phase).toBe(3);
  });
  it("共有後は付箋がHUDに重ならず整列し、開票集計が4人分になる", () => {
    const notes = getLaunchState(20 * 60 + 30).board.notes;
    expect(notes).toHaveLength(4);
    expect(new Set(notes.map((note) => note.y)).size).toBe(1);
    expect(notes.every((note) => note.x >= 400)).toBe(true);
    const results = getLaunchState(35 * 60).board.notes;
    expect(
      results.reduce(
        (sum, note) => sum + (note.dotVotes.subjective.count ?? 0),
        0,
      ),
    ).toBe(4);
    expect(
      results.reduce(
        (sum, note) => sum + (note.dotVotes.objective.count ?? 0),
        0,
      ),
    ).toBe(12);
  });
  it("入力・時間・付箋位置がシーク順序によらず一致する", () => {
    const first = getLaunchState(19 * 60);
    getLaunchState(37 * 60);
    getLaunchState(0);
    expect(getLaunchState(19 * 60)).toEqual(first);
    expect(getLaunchState(16 * 60).renderTimeMs).toBe(2000);
    expect(getLaunchState(17 * 60).renderTimeMs).toBe(3000);
  });
  it("Motionの着地を任意時刻で再現できる", () => {
    const first = snap(14, 0);
    snap(300, 0);
    expect(snap(14, 0)).toBe(first);
    expect(snap(-1, 0)).toBe(0);
    expect(snap(120, 0)).toBeCloseTo(1, 3);
  });
});
