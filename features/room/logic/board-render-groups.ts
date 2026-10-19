import { getNoteHeight, NOTE_WIDTH } from "@/contracts/board";
import {
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
): RenderGroup[] {
  if (!isAtOrAfterGroupingStep(phase)) return [];
  if (isPhaseStep(phase, 1, 3)) return calculateRenderGroups(notes, groups);

  // 分類終了後は RoomDO の所属をそのまま表示する。距離による分割・合体や
  // 無所属付箋の取り込みは行わず、移動した所属付箋に合わせて外枠だけ伸縮する。
  const sortedGroups = [...groups].sort((a, b) => a.id.localeCompare(b.id));
  return sortedGroups.flatMap((group, index) => {
    const members = notes.filter((note) => group.noteIds.includes(note.id));
    if (members.length === 0) return [];
    const left = Math.min(...members.map((note) => note.x));
    const top = Math.min(...members.map((note) => note.y));
    const right = Math.max(...members.map((note) => note.x + NOTE_WIDTH));
    const bottom = Math.max(
      ...members.map(
        (note) => note.y + getNoteHeight(note.content, note.fontSize),
      ),
    );
    return [
      {
        id: group.id,
        persistentGroupId: group.id,
        name: group.name,
        x: left - GROUP_PADDING,
        y: top - GROUP_PADDING,
        width: right - left + 2 * GROUP_PADDING,
        height: bottom - top + 2 * GROUP_PADDING,
        hue: Math.floor((index * 360) / sortedGroups.length),
      },
    ];
  });
}
