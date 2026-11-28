import type { RoomPhase } from "@/contracts/phase";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { type CanvasCamera, fitCanvasCamera } from "../logic/canvas-camera";
import {
  getIdeaMapWorldLayout,
  isIdeaMapViewportStep,
} from "../logic/idea-value-feasibility-map";
import { IDEA_MAP_FIT_PADDING } from "../logic/use-canvas-camera";

const DEFAULT_STORY_CAMERA: CanvasCamera = { x: 0, y: 0, zoom: 1 };

/**
 * 2軸マップはボードの原点を中心に置く。固定カメラ（原点・100%）のStoryでは、
 * 画面にマップ全体を収めたカメラへ置き換える。それ以外のカメラはそのまま使う。
 */
export function storyBoardCamera(
  camera: CanvasCamera,
  phase: RoomPhase,
  ideaMapSizeLevel = 0,
): CanvasCamera {
  const isDefault =
    camera.x === DEFAULT_STORY_CAMERA.x &&
    camera.y === DEFAULT_STORY_CAMERA.y &&
    camera.zoom === DEFAULT_STORY_CAMERA.zoom;
  if (!isDefault || !isIdeaMapViewportStep(phase)) return camera;
  if (typeof window === "undefined") return camera;
  return fitCanvasCamera(
    getIdeaMapWorldLayout(ideaMapSizeLevel).bounds,
    { width: window.innerWidth, height: window.innerHeight },
    IDEA_MAP_FIT_PADDING,
  );
}

export const ADDITIONAL_WRITING_USER = "11111111-1111-4111-8111-111111111111";
export const ADDITIONAL_WRITING_PRIVATE_NOTES = Array.from(
  { length: 12 },
  (_, index) =>
    buildNote({
      id: `additional-draft-${index}`,
      authorId: ADDITIONAL_WRITING_USER,
      visibility: "private",
      content: `未共有の下書き ${index + 1}`,
      contentRevision: index === 9 ? 1 : 0,
      updatedAt: index === 9 ? "2026-11-06T05:00:00Z" : "2026-11-06T04:00:00Z",
    }),
);
export function additionalWritingSharedNotes(phase: 1 | 2 | 3) {
  return [
    buildNote({
      id: "reference-one",
      content:
        "共有した考えを読みながら、新しい考えを書き足す。\n全文表示でも本文を書き換えない。",
      x: phase === 3 ? 25 : 160,
      y: phase === 3 ? 75 : 160,
    }),
    buildNote({
      id: "reference-two",
      content: "パネルの下にある考えも、表示位置を移動して確認する。",
      x: phase === 3 ? 70 : 650,
      y: phase === 3 ? 20 : 550,
    }),
  ];
}
