import type { ReactNode } from "react";
import { Easing, interpolate } from "remotion";
import type { OperationMoment } from "../data/operation-demo-state";
import { PRODUCT_STAGE } from "../stage-geometry";
import { getSegmentMotion } from "./interaction-overlay";

export function ProductStage({
  moment,
  fps,
  children,
  overlay,
}: {
  moment: OperationMoment;
  fps: number;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const motion = getSegmentMotion(moment.segmentId);
  const zoomIn = interpolate(moment.progress, [0.06, 0.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  });
  const zoomOut = interpolate(moment.progress, [0.82, 0.96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const zoom = 1 + (motion.zoom - 1) * (zoomIn - zoomOut);
  const focusX = motion.focus.x - PRODUCT_STAGE.left;
  const focusY = motion.focus.y - PRODUCT_STAGE.top;
  const phaseFade = interpolate(moment.localFrame, [0, 0.35 * fps], [0.84, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: PRODUCT_STAGE.left,
        top: PRODUCT_STAGE.top,
        width: PRODUCT_STAGE.width,
        height: PRODUCT_STAGE.height,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.68)",
        borderRadius: 26,
        background: "white",
        boxShadow:
          "0 32px 90px rgba(15,23,42,0.2), 0 3px 12px rgba(15,23,42,0.1)",
        opacity: phaseFade,
        transform: `scale(${zoom})`,
        transformOrigin: `${focusX}px ${focusY}px`,
      }}
    >
      <div className="remotion-product-root h-full w-full bg-background text-foreground">
        {children}
      </div>
      {overlay ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -PRODUCT_STAGE.left,
            top: -PRODUCT_STAGE.top,
            width: 1920,
            height: 1080,
            zIndex: 100,
          }}
        >
          {overlay}
        </div>
      ) : null}
    </div>
  );
}
