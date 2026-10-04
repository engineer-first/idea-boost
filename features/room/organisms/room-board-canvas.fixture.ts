import type { ProtocolNote } from "@/contracts/room-protocol";
import { buildNote } from "@/contracts/room-protocol.fixture";

// 性能比較用。先頭3枚を固定選択し、10枚ごとに長文を混ぜる。
export function buildMovePerformanceNotes(
  space: "canvas" | "map",
  count = 100,
): ProtocolNote[] {
  return Array.from({ length: count }, (_, index) =>
    buildNote({
      id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
      authorId: "11111111-1111-4111-8111-111111111111",
      content:
        index % 10 === 9
          ? `長文付箋 ${index + 1}\n${"背景と仮説を共有して、検証の方法と結果を考えます。".repeat(12)}`
          : `付箋 ${index + 1}`,
      x: space === "map" ? 5 + (index % 10) * 10 : 80 + (index % 10) * 220,
      y:
        space === "map"
          ? 5 + Math.floor(index / 10) * 10
          : 60 + Math.floor(index / 10) * 180,
      positionRevision: 0,
      visibilityRevision: 0,
      stackOrder: index,
    }),
  );
}
