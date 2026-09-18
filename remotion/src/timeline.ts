export const OPERATION_DEMO_FPS = 60;
export const OPERATION_DEMO_DURATION_SECONDS = 134;
export const OPERATION_DEMO_DURATION_FRAMES =
  OPERATION_DEMO_DURATION_SECONDS * OPERATION_DEMO_FPS;

export type OperationSegmentId =
  | "home"
  | "lobby"
  | `phase-1-step-${1 | 2 | 3 | 4 | 5}`
  | `phase-2-step-${1 | 2 | 3 | 4}`
  | `phase-3-step-${1 | 2 | 3 | 4 | 5}`
  | "complete";

type OperationSegmentDefinition = {
  id: OperationSegmentId;
  durationInSeconds: number;
};

const OPERATION_SEGMENT_DEFINITIONS = [
  { id: "home", durationInSeconds: 6 },
  { id: "lobby", durationInSeconds: 7 },
  { id: "phase-1-step-1", durationInSeconds: 9 },
  { id: "phase-1-step-2", durationInSeconds: 8 },
  { id: "phase-1-step-3", durationInSeconds: 8 },
  { id: "phase-1-step-4", durationInSeconds: 7 },
  { id: "phase-1-step-5", durationInSeconds: 8 },
  { id: "phase-2-step-1", durationInSeconds: 8 },
  { id: "phase-2-step-2", durationInSeconds: 6 },
  { id: "phase-2-step-3", durationInSeconds: 7 },
  { id: "phase-2-step-4", durationInSeconds: 8 },
  { id: "phase-3-step-1", durationInSeconds: 9 },
  { id: "phase-3-step-2", durationInSeconds: 8 },
  { id: "phase-3-step-3", durationInSeconds: 9 },
  { id: "phase-3-step-4", durationInSeconds: 7 },
  { id: "phase-3-step-5", durationInSeconds: 8 },
  { id: "complete", durationInSeconds: 11 },
] as const satisfies readonly OperationSegmentDefinition[];

export type OperationSegment = OperationSegmentDefinition & {
  from: number;
  durationInFrames: number;
};

export function getOperationTimeline(
  fps = OPERATION_DEMO_FPS,
): OperationSegment[] {
  let from = 0;

  return OPERATION_SEGMENT_DEFINITIONS.map((segment) => {
    const durationInFrames = segment.durationInSeconds * fps;
    const timelineSegment = { ...segment, from, durationInFrames };
    from += durationInFrames;
    return timelineSegment;
  });
}
