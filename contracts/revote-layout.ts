import {
  CANVAS_COORDINATE_LIMIT,
  getNoteHeight,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_WIDTH,
} from "./board";
import type { PersistentGroup } from "./grouping";

export interface RevoteLayoutNote {
  id: string;
  x: number;
  y: number;
  content: string;
  fontSize?: number;
}

export interface RevoteLayoutMove {
  noteId: string;
  x: number;
  y: number;
}

const GROUP_PADDING = 16;
const CLUSTER_DISTANCE = 60;
const MIN_GAP = 16;

type Rect = { x: number; y: number; width: number; height: number };

type MutableNote = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

function clampCoord(value: number): number {
  return Math.max(
    -CANVAS_COORDINATE_LIMIT,
    Math.min(CANVAS_COORDINATE_LIMIT, Math.round(value)),
  );
}

function noteRect(note: MutableNote): Rect {
  return { x: note.x, y: note.y, width: note.width, height: note.height };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function computeGroupRect(
  memberIds: readonly string[],
  notesById: Map<string, MutableNote>,
): Rect | null {
  const members = memberIds
    .map((id) => notesById.get(id))
    .filter((n): n is MutableNote => n !== undefined);
  if (members.length === 0) return null;
  const left = Math.min(...members.map((n) => n.x));
  const top = Math.min(...members.map((n) => n.y));
  const right = Math.max(...members.map((n) => n.x + n.width));
  const bottom = Math.max(...members.map((n) => n.y + n.height));
  return {
    x: left - GROUP_PADDING,
    y: top - GROUP_PADDING,
    width: right - left + GROUP_PADDING * 2,
    height: bottom - top + GROUP_PADDING * 2,
  };
}

function isWithinLimit(x: number, y: number): boolean {
  return (
    x >= -CANVAS_COORDINATE_LIMIT &&
    x <= CANVAS_COORDINATE_LIMIT &&
    y >= -CANVAS_COORDINATE_LIMIT &&
    y <= CANVAS_COORDINATE_LIMIT
  );
}

function hasAnyConflict(
  notes: readonly MutableNote[],
  groups: readonly PersistentGroup[],
  notesById: Map<string, MutableNote>,
): boolean {
  const groupRects = groups
    .map((g) => ({ group: g, rect: computeGroupRect(g.noteIds, notesById) }))
    .filter((entry): entry is { group: PersistentGroup; rect: Rect } =>
      Boolean(entry.rect),
    );

  for (let i = 0; i < groupRects.length; i++) {
    for (let j = i + 1; j < groupRects.length; j++) {
      if (rectsOverlap(groupRects[i].rect, groupRects[j].rect)) return true;
    }
  }

  for (const note of notes) {
    const nRect = noteRect(note);
    for (const { group, rect } of groupRects) {
      if (group.noteIds.includes(note.id)) continue;
      if (rectsOverlap(nRect, rect)) return true;
    }
  }
  return false;
}

function areNotesClose(a: MutableNote, b: MutableNote): boolean {
  const dx = Math.max(
    0,
    Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width),
  );
  const dy = Math.max(
    0,
    Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height),
  );
  return dx <= CLUSTER_DISTANCE && dy <= CLUSTER_DISTANCE;
}

function clusterMemberNotes(members: readonly MutableNote[]): MutableNote[][] {
  const visited = new Set<string>();
  const clusters: MutableNote[][] = [];
  for (const start of members) {
    if (visited.has(start.id)) continue;
    visited.add(start.id);
    const cluster: MutableNote[] = [start];
    const queue: MutableNote[] = [start];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const other of members) {
        if (visited.has(other.id)) continue;
        if (areNotesClose(curr, other)) {
          visited.add(other.id);
          cluster.push(other);
          queue.push(other);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function centerOf(items: readonly MutableNote[]): { cx: number; cy: number } {
  const cx =
    items.reduce((sum, n) => sum + n.x + n.width / 2, 0) / items.length;
  const cy =
    items.reduce((sum, n) => sum + n.y + n.height / 2, 0) / items.length;
  return { cx, cy };
}

function pickPrimaryCluster(
  clusters: readonly MutableNote[][],
  allMembers: readonly MutableNote[],
): MutableNote[] {
  const groupCenter = centerOf(allMembers);
  const sorted = [...clusters].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const ca = centerOf(a);
    const cb = centerOf(b);
    const da = Math.hypot(ca.cx - groupCenter.cx, ca.cy - groupCenter.cy);
    const db = Math.hypot(cb.cx - groupCenter.cx, cb.cy - groupCenter.cy);
    if (Math.abs(da - db) > 1e-6) return da - db;
    const minIdA = a.map((n) => n.id).sort()[0];
    const minIdB = b.map((n) => n.id).sort()[0];
    return minIdA.localeCompare(minIdB);
  });
  return sorted[0];
}

function findNearestFreeSlot(
  target: MutableNote,
  anchorBox: Rect,
  avoidRects: readonly Rect[],
  otherNoteRects: readonly Rect[],
  extraValidate?: (candRect: Rect) => boolean,
): { x: number; y: number } {
  const stepX = NOTE_WIDTH + MIN_GAP;
  const stepY = target.height + MIN_GAP;
  let bestX = 0;
  let bestY = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  const tryCandidate = (rawX: number, rawY: number) => {
    const x = clampCoord(rawX);
    const y = clampCoord(rawY);
    if (!isWithinLimit(x, y)) return;
    const candRect: Rect = { x, y, width: target.width, height: target.height };
    for (const r of avoidRects) {
      if (rectsOverlap(candRect, r)) return;
    }
    for (const r of otherNoteRects) {
      if (rectsOverlap(candRect, r)) return;
    }
    if (extraValidate && !extraValidate(candRect)) return;
    const dist = Math.hypot(x - target.x, y - target.y);
    if (dist < bestDist) {
      bestX = x;
      bestY = y;
      bestDist = dist;
    }
  };

  for (let ring = 1; ring <= 6; ring++) {
    const gap = MIN_GAP * ring + (ring - 1) * Math.max(NOTE_WIDTH, target.height);
    const leftX = anchorBox.x - target.width - gap;
    const rightX = anchorBox.x + anchorBox.width + gap;
    const topY = anchorBox.y - target.height - gap;
    const bottomY = anchorBox.y + anchorBox.height + gap;

    const cols = Math.max(1, Math.ceil(anchorBox.width / stepX));
    const rows = Math.max(1, Math.ceil(anchorBox.height / stepY));

    for (let c = -1; c <= cols + 1; c++) {
      const x = anchorBox.x + c * stepX;
      tryCandidate(x, topY);
      tryCandidate(x, bottomY);
    }
    for (let r = -1; r <= rows + 1; r++) {
      const y = anchorBox.y + r * stepY;
      tryCandidate(leftX, y);
      tryCandidate(rightX, y);
    }
    if (Number.isFinite(bestDist)) return { x: bestX, y: bestY };
  }

  return {
    x: clampCoord(anchorBox.x + anchorBox.width + MIN_GAP),
    y: clampCoord(anchorBox.y),
  };
}

// Step 1: グループ内で主クラスタから飛び出して重なりを生んでいる付箋だけを主クラスタの横へ引き戻す
function pullBackOutlierNotes(
  notes: readonly MutableNote[],
  groups: readonly PersistentGroup[],
  notesById: Map<string, MutableNote>,
): void {
  const groupRects = new Map<string, Rect>();
  for (const g of groups) {
    const r = computeGroupRect(g.noteIds, notesById);
    if (r) groupRects.set(g.id, r);
  }

  for (const group of groups) {
    const myRect = groupRects.get(group.id);
    if (!myRect) continue;

    const otherGroupRects: Rect[] = [];
    for (const other of groups) {
      if (other.id === group.id) continue;
      const r = groupRects.get(other.id);
      if (r) otherGroupRects.push(r);
    }

    const overlapsOtherGroup = otherGroupRects.some((r) =>
      rectsOverlap(myRect, r),
    );
    const containsNonMember = notes.some(
      (n) => !group.noteIds.includes(n.id) && rectsOverlap(noteRect(n), myRect),
    );
    if (!overlapsOtherGroup && !containsNonMember) continue;

    const members = group.noteIds
      .map((id) => notesById.get(id))
      .filter((n): n is MutableNote => n !== undefined);
    if (members.length < 2) continue;

    const clusters = clusterMemberNotes(members);
    if (clusters.length <= 1) continue;

    const primary = pickPrimaryCluster(clusters, members);
    const primaryIds = new Set(primary.map((n) => n.id));
    const pCenter = centerOf(primary);
    const outliers = members
      .filter((n) => !primaryIds.has(n.id))
      .sort(
        (a, b) =>
          Math.hypot(a.x - pCenter.cx, a.y - pCenter.cy) -
          Math.hypot(b.x - pCenter.cx, b.y - pCenter.cy),
      );

    for (const outlier of outliers) {
      const currentClusterMembers = members.filter((m) =>
        primaryIds.has(m.id),
      );
      const left = Math.min(...currentClusterMembers.map((m) => m.x));
      const top = Math.min(...currentClusterMembers.map((m) => m.y));
      const right = Math.max(
        ...currentClusterMembers.map((m) => m.x + m.width),
      );
      const bottom = Math.max(
        ...currentClusterMembers.map((m) => m.y + m.height),
      );
      const anchorBox: Rect = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
      const otherNoteRects = notes
        .filter((n) => n.id !== outlier.id)
        .map((n) => noteRect(n));

      const slot = findNearestFreeSlot(
        outlier,
        anchorBox,
        otherGroupRects,
        otherNoteRects,
        (candRect) => {
          const left = Math.min(anchorBox.x, candRect.x) - GROUP_PADDING;
          const top = Math.min(anchorBox.y, candRect.y) - GROUP_PADDING;
          const right =
            Math.max(
              anchorBox.x + anchorBox.width,
              candRect.x + candRect.width,
            ) + GROUP_PADDING;
          const bottom =
            Math.max(
              anchorBox.y + anchorBox.height,
              candRect.y + candRect.height,
            ) + GROUP_PADDING;
          const nextGroupRect: Rect = {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          };
          return !otherGroupRects.some((r) => rectsOverlap(nextGroupRect, r));
        },
      );
      outlier.x = slot.x;
      outlier.y = slot.y;
      primaryIds.add(outlier.id);
    }

    const updatedRect = computeGroupRect(group.noteIds, notesById);
    if (updatedRect) groupRects.set(group.id, updatedRect);
  }
}

// Step 2: グループ内の相対位置を保ったままグループ全体を平行移動して枠同士の重なりを解消する
function separateOverlappingGroups(
  groups: readonly PersistentGroup[],
  notesById: Map<string, MutableNote>,
): void {
  const activeGroups = groups.filter((g) =>
    g.noteIds.some((id) => notesById.has(id)),
  );
  if (activeGroups.length < 2) return;

  const maxIterations = activeGroups.length * activeGroups.length * 8 + 40;
  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;
    for (let i = 0; i < activeGroups.length; i++) {
      for (let j = i + 1; j < activeGroups.length; j++) {
        const gA = activeGroups[i];
        const gB = activeGroups[j];
        const rA = computeGroupRect(gA.noteIds, notesById);
        const rB = computeGroupRect(gB.noteIds, notesById);
        if (!rA || !rB || !rectsOverlap(rA, rB)) continue;

        const overlapLeft = rB.x + rB.width - rA.x;
        const overlapRight = rA.x + rA.width - rB.x;
        const overlapTop = rB.y + rB.height - rA.y;
        const overlapBottom = rA.y + rA.height - rB.y;

        const pushX = Math.min(overlapLeft, overlapRight) + MIN_GAP;
        const pushY = Math.min(overlapTop, overlapBottom) + MIN_GAP;

        let dx = 0;
        let dy = 0;
        if (pushX <= pushY) {
          dx = overlapRight <= overlapLeft ? pushX : -pushX;
        } else {
          dy = overlapBottom <= overlapTop ? pushY : -pushY;
        }

        const halfAx = Math.trunc(-dx / 2);
        const halfAy = Math.trunc(-dy / 2);
        const halfBx = dx + halfAx;
        const halfBy = dy + halfAy;

        shiftGroup(gA, halfAx, halfAy, notesById);
        shiftGroup(gB, halfBx, halfBy, notesById);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function shiftGroup(
  group: PersistentGroup,
  dx: number,
  dy: number,
  notesById: Map<string, MutableNote>,
): void {
  if (dx === 0 && dy === 0) return;
  const members = group.noteIds
    .map((id) => notesById.get(id))
    .filter((n): n is MutableNote => n !== undefined);
  if (members.length === 0) return;

  // 全メンバーが CANVAS_COORDINATE_LIMIT 内に収まるようシフト量を丸める
  let actualDx = dx;
  let actualDy = dy;
  for (const m of members) {
    if (m.x + actualDx > CANVAS_COORDINATE_LIMIT) {
      actualDx = CANVAS_COORDINATE_LIMIT - m.x;
    }
    if (m.x + actualDx < -CANVAS_COORDINATE_LIMIT) {
      actualDx = -CANVAS_COORDINATE_LIMIT - m.x;
    }
    if (m.y + actualDy > CANVAS_COORDINATE_LIMIT) {
      actualDy = CANVAS_COORDINATE_LIMIT - m.y;
    }
    if (m.y + actualDy < -CANVAS_COORDINATE_LIMIT) {
      actualDy = -CANVAS_COORDINATE_LIMIT - m.y;
    }
  }
  for (const m of members) {
    m.x = clampCoord(m.x + actualDx);
    m.y = clampCoord(m.y + actualDy);
  }
}

// Step 3: グループ枠内に入っている非所属付箋を枠のすぐ外へ退避する
function pushOutNonMemberNotes(
  notes: readonly MutableNote[],
  groups: readonly PersistentGroup[],
  notesById: Map<string, MutableNote>,
): void {
  const groupRects = groups
    .map((g) => ({ group: g, rect: computeGroupRect(g.noteIds, notesById) }))
    .filter((entry): entry is { group: PersistentGroup; rect: Rect } =>
      Boolean(entry.rect),
    );
  if (groupRects.length === 0) return;

  for (const note of notes) {
    const foreignGroupRects = groupRects
      .filter(({ group }) => !group.noteIds.includes(note.id))
      .map(({ rect }) => rect);

    const overlapping = foreignGroupRects.filter((r) =>
      rectsOverlap(noteRect(note), r),
    );
    if (overlapping.length === 0) continue;

    const otherNoteRects = notes
      .filter((n) => n.id !== note.id)
      .map((n) => noteRect(n));

    const firstRect = overlapping[0];
    const slot = findNearestFreeSlot(
      note,
      firstRect,
      foreignGroupRects,
      otherNoteRects,
    );
    note.x = slot.x;
    note.y = slot.y;
  }
}

export function computeRevoteLayout(
  notes: readonly RevoteLayoutNote[],
  groups: readonly PersistentGroup[],
): RevoteLayoutMove[] {
  if (notes.length === 0 || groups.length === 0) return [];

  const mutableNotes: MutableNote[] = notes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    width: NOTE_WIDTH,
    height: getNoteHeight(n.content, n.fontSize ?? NOTE_DEFAULT_FONT_SIZE),
  }));
  const notesById = new Map(mutableNotes.map((n) => [n.id, n]));

  if (!hasAnyConflict(mutableNotes, groups, notesById)) {
    return [];
  }

  pullBackOutlierNotes(mutableNotes, groups, notesById);
  separateOverlappingGroups(groups, notesById);
  pushOutNonMemberNotes(mutableNotes, groups, notesById);

  const originalById = new Map(notes.map((n) => [n.id, n]));
  const moves: RevoteLayoutMove[] = [];
  for (const note of mutableNotes) {
    const orig = originalById.get(note.id);
    if (orig && (note.x !== orig.x || note.y !== orig.y)) {
      moves.push({ noteId: note.id, x: note.x, y: note.y });
    }
  }
  return moves;
}
