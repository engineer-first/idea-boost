import { describe, expect, it } from "vitest";
import {
  getOperationTimeline,
  OPERATION_DEMO_DURATION_FRAMES,
  OPERATION_DEMO_FPS,
} from "./timeline";

describe("IdeaFlow operation demo timeline", () => {
  it("is a brisk 120-second composition at 60 fps", () => {
    expect(OPERATION_DEMO_FPS).toBe(60);
    expect(OPERATION_DEMO_DURATION_FRAMES).toBe(120 * OPERATION_DEMO_FPS);
  });

  it("shows the lobby, all 14 steps, and the completed state in order", () => {
    const timeline = getOperationTimeline();

    expect(timeline.map((scene) => scene.id)).toEqual([
      "home",
      "lobby",
      "phase-1-step-1",
      "phase-1-step-2",
      "phase-1-step-3",
      "phase-1-step-4",
      "phase-1-step-5",
      "phase-2-step-1",
      "phase-2-step-2",
      "phase-2-step-3",
      "phase-2-step-4",
      "phase-3-step-1",
      "phase-3-step-2",
      "phase-3-step-3",
      "phase-3-step-4",
      "phase-3-step-5",
      "complete",
    ]);
  });

  it("uses the agreed durations and fills the composition without gaps", () => {
    const timeline = getOperationTimeline();

    expect(timeline.map((scene) => scene.durationInSeconds)).toEqual([
      6, 7, 8, 7, 7, 6, 7, 7, 5, 6, 7, 8, 7, 8, 6, 7, 11,
    ]);
    expect(timeline[0]?.from).toBe(0);

    for (const [index, scene] of timeline.entries()) {
      const nextScene = timeline[index + 1];
      if (nextScene) {
        expect(scene.from + scene.durationInFrames).toBe(nextScene.from);
      }
    }

    const lastScene = timeline.at(-1);
    expect(lastScene).toBeDefined();
    if (!lastScene) return;
    expect(lastScene.from + lastScene.durationInFrames).toBe(
      OPERATION_DEMO_DURATION_FRAMES,
    );
  });
});
