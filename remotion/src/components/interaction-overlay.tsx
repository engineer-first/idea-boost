import { MousePointer2 } from "lucide-react";
import { Easing, interpolate } from "remotion";
import { DotVoteSticker } from "@/features/dot-vote";
import {
  getPrimaryDragPointer,
  getVoteDrag,
  type OperationMoment,
} from "../data/operation-demo-state";
import { PRODUCT_STAGE } from "../stage-geometry";
import type { OperationSegmentId } from "../timeline";

type Point = { x: number; y: number };

type SegmentMotion = {
  from: Point;
  to: Point;
  clickAt: number | null;
  focus: Point;
  zoom: number;
};

const DEFAULT_MOTION: SegmentMotion = {
  from: { x: 1500, y: 930 },
  to: { x: 1500, y: 930 },
  clickAt: null,
  focus: { x: 960, y: 540 },
  zoom: 1.02,
};

const SEGMENT_MOTIONS: Partial<Record<OperationSegmentId, SegmentMotion>> = {
  home: {
    from: { x: 1280, y: 790 },
    to: { x: 785, y: 735 },
    clickAt: 0.65,
    focus: { x: 785, y: 630 },
    zoom: 1.04,
  },
  lobby: {
    from: { x: 1260, y: 420 },
    to: { x: 960, y: 790 },
    clickAt: 0.76,
    focus: { x: 960, y: 570 },
    zoom: 1.035,
  },
  "phase-1-step-1": {
    from: { x: 1710, y: 982 },
    to: { x: 1635, y: 835 },
    clickAt: 0.2,
    focus: { x: 1570, y: 780 },
    zoom: 1.055,
  },
  "phase-1-step-2": {
    from: { x: 1615, y: 820 },
    to: { x: 366, y: 294 },
    clickAt: null,
    focus: { x: 620, y: 560 },
    zoom: 1.055,
  },
  "phase-1-step-3": {
    from: { x: 1150, y: 450 },
    to: { x: 650, y: 470 },
    clickAt: null,
    focus: { x: 640, y: 470 },
    zoom: 1.06,
  },
  "phase-1-step-4": {
    from: { x: 610, y: 520 },
    to: { x: 505, y: 560 },
    clickAt: 0.6,
    focus: { x: 570, y: 500 },
    zoom: 1.06,
  },
  "phase-1-step-5": {
    from: { x: 1420, y: 300 },
    to: { x: 1235, y: 535 },
    clickAt: 0.73,
    focus: { x: 1120, y: 560 },
    zoom: 1.045,
  },
  "phase-2-step-1": {
    from: { x: 250, y: 460 },
    to: { x: 1635, y: 835 },
    clickAt: 0.22,
    focus: { x: 960, y: 620 },
    zoom: 1.055,
  },
  "phase-2-step-2": {
    from: { x: 750, y: 870 },
    to: { x: 600, y: 430 },
    clickAt: null,
    focus: { x: 720, y: 510 },
    zoom: 1.05,
  },
  "phase-2-step-3": {
    from: { x: 910, y: 500 },
    to: { x: 900, y: 550 },
    clickAt: 0.56,
    focus: { x: 900, y: 500 },
    zoom: 1.06,
  },
  "phase-2-step-4": {
    from: { x: 1420, y: 300 },
    to: { x: 1235, y: 535 },
    clickAt: 0.73,
    focus: { x: 1120, y: 560 },
    zoom: 1.045,
  },
  "phase-3-step-1": {
    from: { x: 200, y: 450 },
    to: { x: 340, y: 424 },
    clickAt: 0.24,
    focus: { x: 300, y: 535 },
    zoom: 1.055,
  },
  "phase-3-step-2": {
    from: { x: 760, y: 870 },
    to: { x: 1190, y: 400 },
    clickAt: null,
    focus: { x: 1050, y: 500 },
    zoom: 1.06,
  },
  "phase-3-step-3": {
    from: { x: 950, y: 650 },
    to: { x: 1330, y: 340 },
    clickAt: null,
    focus: { x: 1120, y: 500 },
    zoom: 1.065,
  },
  "phase-3-step-4": {
    from: { x: 1120, y: 520 },
    to: { x: 1280, y: 430 },
    clickAt: 0.58,
    focus: { x: 1160, y: 480 },
    zoom: 1.06,
  },
  "phase-3-step-5": {
    from: { x: 1420, y: 300 },
    to: { x: 1235, y: 535 },
    clickAt: 0.73,
    focus: { x: 1120, y: 560 },
    zoom: 1.045,
  },
  complete: {
    from: { x: 1460, y: 280 },
    to: { x: 1460, y: 280 },
    clickAt: null,
    focus: { x: 960, y: 540 },
    zoom: 1.015,
  },
};

export function getSegmentMotion(segmentId: OperationSegmentId): SegmentMotion {
  return SEGMENT_MOTIONS[segmentId] ?? DEFAULT_MOTION;
}

function easedProgress(progress: number): number {
  return Easing.bezier(
    0.22,
    1,
    0.36,
    1,
  )(
    interpolate(progress, [0.08, 0.58], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
}

export function InteractionOverlay({
  moment,
  fps,
}: {
  moment: OperationMoment;
  fps: number;
}) {
  const motion = getSegmentMotion(moment.segmentId);
  const scriptedDragPointer = getPrimaryDragPointer(moment);
  const voteDrag = getVoteDrag(moment);
  const travel = easedProgress(moment.progress);
  const x =
    (voteDrag ? voteDrag.x + PRODUCT_STAGE.left : undefined) ??
    scriptedDragPointer?.x ??
    motion.from.x + (motion.to.x - motion.from.x) * travel;
  const y =
    (voteDrag ? voteDrag.y + PRODUCT_STAGE.top : undefined) ??
    scriptedDragPointer?.y ??
    motion.from.y + (motion.to.y - motion.from.y) * travel;
  const cursorOpacity = interpolate(
    moment.progress,
    [0, 0.05, 0.94, 1],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-[100]">
      {voteDrag?.isDragging ? (
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <DotVoteSticker kind={voteDrag.kind} count={1} state="preview" />
        </div>
      ) : null}
      {motion.clickAt === null || voteDrag !== null ? null : (
        <ClickRipples
          x={motion.to.x}
          y={motion.to.y}
          localFrame={moment.localFrame}
          clickFrame={motion.clickAt * moment.durationInFrames}
          fps={fps}
        />
      )}
      <MousePointer2
        aria-hidden="true"
        fill="white"
        strokeWidth={2.4}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 34,
          height: 34,
          opacity: cursorOpacity,
          filter: "drop-shadow(0 3px 5px rgba(15,23,42,0.35))",
          transform: "translate(-7px, -5px)",
        }}
      />
    </div>
  );
}

function ClickRipples({
  x,
  y,
  localFrame,
  clickFrame,
  fps,
}: {
  x: number;
  y: number;
  localFrame: number;
  clickFrame: number;
  fps: number;
}) {
  return (
    <>
      {[0, 0.08].map((delaySeconds) => {
        const rippleFrame = localFrame - clickFrame - delaySeconds * fps;
        const duration = 0.45 * fps;
        const scale = interpolate(rippleFrame, [0, duration], [0.45, 1.9], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        });
        const opacity = interpolate(rippleFrame, [0, duration], [0.34, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        if (rippleFrame < 0 || rippleFrame > duration) return null;

        return (
          <span
            key={delaySeconds}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 54,
              height: 54,
              border: "3px solid rgb(59 130 246)",
              borderRadius: "50%",
              opacity,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          />
        );
      })}
    </>
  );
}
