"use client";

import { useCallback, useRef } from "react";
import { isPhaseStep, type RoomPhase } from "@/contracts/phase";
import type { CanvasPoint } from "./canvas-camera";
import { getIdeaValueFeasibilityMapPointFromClientPosition } from "./idea-value-feasibility-map";

export type UseIdeaValueFeasibilityMapInputArgs = {
  phase: RoomPhase;
  fallbackPointFromClient: (
    clientX: number,
    clientY: number,
  ) => CanvasPoint | null;
};

/**
 * 2軸マップの平面参照と、マップ配置ステップ用の座標変換をまとめる。
 */
export function useIdeaValueFeasibilityMapInput({
  phase,
  fallbackPointFromClient,
}: UseIdeaValueFeasibilityMapInputArgs) {
  const ideaMapPlaneRef = useRef<HTMLDivElement>(null);
  const isIdeaValueFeasibilityMappingStep =
    isPhaseStep(phase, 3, 2) || isPhaseStep(phase, 3, 3);

  const pointFromClient = useCallback(
    (clientX: number, clientY: number): CanvasPoint | null => {
      if (!isIdeaValueFeasibilityMappingStep) {
        return fallbackPointFromClient(clientX, clientY);
      }
      const plane = ideaMapPlaneRef.current;
      if (!plane) return null;
      const point = getIdeaValueFeasibilityMapPointFromClientPosition(
        clientX,
        clientY,
        plane.getBoundingClientRect(),
        // つかみ位置補正後の最終座標だけをuseBoardDragで0〜100に制限する。
        false,
      );
      return point ? { x: point.feasibility, y: point.value } : null;
    },
    [fallbackPointFromClient, isIdeaValueFeasibilityMappingStep],
  );

  return {
    ideaMapPlaneRef,
    isIdeaValueFeasibilityMappingStep,
    pointFromClient,
  };
}
