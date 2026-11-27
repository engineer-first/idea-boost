import { getNoteHeight, NOTE_WIDTH } from "@/contracts/board";
import {
  calculateClusters,
  calculateRenderGroups,
  type PersistentGroup,
  type RenderGroup,
} from "@/contracts/grouping";
import {
  isAtOrAfterGroupingStep,
  isPhaseStep,
  type RoomPhase,
} from "@/contracts/phase";
import type { ProtocolNote } from "@/contracts/room-protocol";

const GROUP_PADDING = 16;

export function getBoardRenderGroups(
  notes: ProtocolNote[],
  groups: PersistentGroup[],
  phase: RoomPhase,
  preserveSharedGroups = false,
): RenderGroup[] {
  if (
    !isAtOrAfterGroupingStep(phase) &&
    !(preserveSharedGroups && isPhaseStep(phase, 1, 1))
  )
    return [];
  if (isPhaseStep(phase, 1, 3)) return calculateRenderGroups(notes, groups);

  // 分類終了後は RoomDO の所属をそのまま表示する。無所属付箋の取り込みや
  // 所属の変更は行わず、除外した付箋を外し、離れて置いた所属付箋は
  // 1-3 と同じ距離のまとまりごとに同じ色・名前の枠を別々に描く。
  const sortedGroups = [...groups].sort((a, b) => a.id.localeCompare(b.id));
  return sortedGroups.flatMap((group, index) => {
    const members = notes.filter(
      (note) => !note.excluded && group.noteIds.includes(note.id),
    );
    const hue = Math.floor((index * 360) / sortedGroups.length);
    return calculateClusters(members).map((ids) => {
      const cluster = members.filter((note) => ids.includes(note.id));
      // key をまとまりの中身だけで決め、他の人が付箋を動かしても枠どうしで入れ替えない。
      // グループで最も小さい付箋 ID を含むまとまりは、所属の ID のまま描く。
      const anchorId = [...ids].sort()[0];
      return {
        ...frameAround(cluster),
        id:
          anchorId === members.map((note) => note.id).sort()[0]
            ? group.id
            : `${group.id}:${anchorId}`,
        persistentGroupId: group.id,
        name: group.name,
        hue,
      };
    });
  });
}

function frameAround(members: ProtocolNote[]) {
  const left = Math.min(...members.map((note) => note.x));
  const top = Math.min(...members.map((note) => note.y));
  const right = Math.max(...members.map((note) => note.x + NOTE_WIDTH));
  const bottom = Math.max(
    ...members.map(
      (note) => note.y + getNoteHeight(note.content, note.fontSize),
    ),
  );
  return {
    x: left - GROUP_PADDING,
    y: top - GROUP_PADDING,
    width: right - left + 2 * GROUP_PADDING,
    height: bottom - top + 2 * GROUP_PADDING,
  };
}
