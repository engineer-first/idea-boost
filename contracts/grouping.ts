import { CANVAS_COORDINATE_LIMIT, getNoteHeight, NOTE_WIDTH } from "./board";
import type { ProtocolNote } from "./room-protocol";

type Note = ProtocolNote;

export interface PersistentGroup {
  id: string;
  name: string;
  noteIds: string[];
}

export interface RenderGroup {
  id: string;
  name: string; // 空文字の場合は名前なし（外枠）
  x: number;
  y: number;
  width: number;
  height: number;
  isTemp?: boolean;
  persistentGroupId?: string;
  representativeNoteId?: string; // 新規登録・表示枠の識別用
  hue?: number;
}

export type GroupBounds = Pick<RenderGroup, "x" | "y" | "width" | "height">;

// 表示枠の中心点判定をUIとRoomDOで共用する。保存上の所属に依存しない。
export function getGroupMoveTargets(
  notes: Note[],
  bounds: GroupBounds,
): Note[] {
  return notes.filter((note) => {
    const centerX = note.x + NOTE_WIDTH / 2;
    const centerY = note.y + getNoteHeight(note.content, note.fontSize) / 2;
    return (
      note.visibility === "shared" &&
      centerX >= bounds.x &&
      centerX <= bounds.x + bounds.width &&
      centerY >= bounds.y &&
      centerY <= bounds.y + bounds.height
    );
  });
}

// 端に達しても全対象へ同じ差分を適用し、相対配置を保つ。
export function clampGroupDelta(
  positions: readonly { x: number; y: number }[],
  delta: { x: number; y: number },
): { x: number; y: number } {
  if (positions.length === 0) return { x: 0, y: 0 };
  return {
    x: Math.max(
      -CANVAS_COORDINATE_LIMIT - Math.min(...positions.map((p) => p.x)),
      Math.min(
        CANVAS_COORDINATE_LIMIT - Math.max(...positions.map((p) => p.x)),
        delta.x,
      ),
    ),
    y: Math.max(
      -CANVAS_COORDINATE_LIMIT - Math.min(...positions.map((p) => p.y)),
      Math.min(
        CANVAS_COORDINATE_LIMIT - Math.max(...positions.map((p) => p.y)),
        delta.y,
      ),
    ),
  };
}

const DISTANCE_THRESHOLD = 60;
const GROUP_PADDING = 16;

function isClose(a: Note, b: Note): boolean {
  const aHeight = getNoteHeight(a.content, a.fontSize);
  const bHeight = getNoteHeight(b.content, b.fontSize);
  const dx = Math.max(
    0,
    Math.max(a.x, b.x) - Math.min(a.x + NOTE_WIDTH, b.x + NOTE_WIDTH),
  );
  const dy = Math.max(
    0,
    Math.max(a.y, b.y) - Math.min(a.y + aHeight, b.y + bHeight),
  );
  return dx <= DISTANCE_THRESHOLD && dy <= DISTANCE_THRESHOLD;
}

// 連結成分（孤立ノードも含めてすべて）を計算
export function calculateClusters(notes: Note[]): string[][] {
  if (notes.length === 0) {
    return [];
  }

  // 1. 隣接リストの構築
  const adj = new Map<string, string[]>();
  for (const note of notes) {
    adj.set(note.id, []);
  }

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const noteA = notes[i];
      const noteB = notes[j];
      if (isClose(noteA, noteB)) {
        const neighborsA = adj.get(noteA.id);
        const neighborsB = adj.get(noteB.id);
        if (neighborsA && neighborsB) {
          neighborsA.push(noteB.id);
          neighborsB.push(noteA.id);
        }
      }
    }
  }

  // 2. 連結成分の抽出 (DFS)
  const visited = new Set<string>();
  const clusters: string[][] = [];

  for (const note of notes) {
    if (visited.has(note.id)) {
      continue;
    }

    const cluster: string[] = [];
    const stack = [note.id];
    visited.add(note.id);

    while (stack.length > 0) {
      const currId = stack.pop();
      if (!currId) {
        continue;
      }
      cluster.push(currId);

      const neighbors = adj.get(currId) || [];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          stack.push(neighborId);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

// メンバーシップの自動再編成
export function reorganizeGroups(
  notes: Note[],
  currentGroups: PersistentGroup[],
): PersistentGroup[] {
  const clusters = calculateClusters(notes);
  const newGroups: PersistentGroup[] = [];
  const processedGroupIds = new Set<string>();

  for (const cluster of clusters) {
    // このクラスターに含まれる付箋が、以前どのグループに属していたかをカウント
    const prevGroupCounts = new Map<string, number>();
    const noteIdToPrevGroup = new Map<string, string>();

    for (const noteId of cluster) {
      const exists = notes.some((n) => n.id === noteId);
      if (!exists) {
        continue;
      }

      const g = currentGroups.find((group) => group.noteIds.includes(noteId));
      if (g) {
        prevGroupCounts.set(g.id, (prevGroupCounts.get(g.id) || 0) + 1);
        noteIdToPrevGroup.set(noteId, g.id);
      }
    }

    const presentGroupIds = Array.from(prevGroupCounts.keys());

    if (presentGroupIds.length === 0) {
      // 新規無名クラスター
      continue;
    }

    // 支配的グループを求める
    let dominantGroupId = presentGroupIds[0];
    let maxCount = prevGroupCounts.get(dominantGroupId) || 0;
    for (const gid of presentGroupIds) {
      const count = prevGroupCounts.get(gid) || 0;
      if (count > maxCount) {
        maxCount = count;
        dominantGroupId = gid;
      }
    }

    for (const groupId of presentGroupIds) {
      const originalGroup = currentGroups.find((g) => g.id === groupId);
      if (!originalGroup) {
        continue;
      }
      processedGroupIds.add(groupId);

      const newNoteIds: string[] = [];

      for (const noteId of cluster) {
        const prevGid = noteIdToPrevGroup.get(noteId);
        if (prevGid === groupId) {
          newNoteIds.push(noteId);
        } else if (!prevGid && groupId === dominantGroupId) {
          // 無所属の付箋は、このクラスター内の支配的なグループに加入
          newNoteIds.push(noteId);
        }
      }

      // メンバー数が2個以上残っている場合のみグループを存続
      if (newNoteIds.length >= 2) {
        const idExists = newGroups.some((g) => g.id === originalGroup.id);
        const nextId = idExists ? crypto.randomUUID() : originalGroup.id;

        newGroups.push({
          ...originalGroup,
          id: nextId,
          noteIds: newNoteIds,
        });
      }
    }
  }

  return newGroups;
}

function calculateBoundingBox(notes: Note[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of notes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NOTE_WIDTH);
    maxY = Math.max(maxY, n.y + getNoteHeight(n.content, n.fontSize));
  }

  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING,
    width: maxX - minX + 2 * GROUP_PADDING,
    height: maxY - minY + 2 * GROUP_PADDING,
  };
}

// 描画用のグループ枠計算
export function calculateRenderGroups(
  notes: Note[],
  groups: PersistentGroup[],
): RenderGroup[] {
  const allClusters = calculateClusters(notes);
  // 描画対象は要素数2以上のクラスターのみ
  const clusters = allClusters.filter((c) => c.length >= 2);
  const renderGroups: RenderGroup[] = [];

  for (const cluster of clusters) {
    const clusterNoteIds = new Set(cluster);

    // このクラスターと交差する永続グループを抽出
    const intersectingGroups = groups.filter((g) =>
      g.noteIds.some((id) => clusterNoteIds.has(id)),
    );

    // 各永続グループの実際のアクティブなメンバー（このクラスター内にいる付箋のみ）
    const activeGroups = intersectingGroups
      .map((g) => {
        const activeNotes = notes.filter(
          (n) => g.noteIds.includes(n.id) && clusterNoteIds.has(n.id),
        );
        return {
          ...g,
          activeNotes,
        };
      })
      .filter((ag) => ag.activeNotes.length >= 2);

    const clusterNotes = notes.filter((n) => clusterNoteIds.has(n.id));
    const box = calculateBoundingBox(clusterNotes);

    if (activeGroups.length >= 2) {
      // 合体ケース：入れ子にはせず単一の枠にする。
      // 名前は最もアクティブメンバー数が多い支配的なグループのものを使用。
      let dominant = activeGroups[0];
      let maxCount = dominant.activeNotes.length;
      for (const ag of activeGroups) {
        if (ag.activeNotes.length > maxCount) {
          maxCount = ag.activeNotes.length;
          dominant = ag;
        } else if (ag.activeNotes.length === maxCount) {
          if (ag.id < dominant.id) {
            dominant = ag;
          }
        }
      }

      renderGroups.push({
        id: `combined-${cluster.sort().join(",")}`,
        name: dominant.name,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        persistentGroupId: dominant.id,
        representativeNoteId: cluster[0],
      });
    } else if (activeGroups.length === 1) {
      // 単一グループケース
      renderGroups.push({
        id: `${activeGroups[0].id}-${cluster.sort().join(",")}`,
        name: activeGroups[0].name,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        persistentGroupId: activeGroups[0].id,
        representativeNoteId: cluster[0],
      });
    } else {
      // 新規仮グループケース
      const sortedIds = cluster.sort();
      renderGroups.push({
        id: `temp-${sortedIds.join(",")}`,
        name: "グループ",
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        isTemp: true,
        representativeNoteId: sortedIds[0],
      });
    }
  }

  // 同時表示されているグループの色被りを防ぐため、ID順でソートして等間隔の色相(hue)を割り当てる
  const count = renderGroups.length;
  if (count > 0) {
    const getSeedId = (rg: RenderGroup) =>
      rg.persistentGroupId || rg.representativeNoteId || rg.id;

    const sortedGroups = [...renderGroups].sort((a, b) =>
      getSeedId(a).localeCompare(getSeedId(b)),
    );

    sortedGroups.forEach((rg, index) => {
      const target = renderGroups.find((g) => g.id === rg.id);
      if (target) {
        target.hue = Math.floor((index * 360) / count);
      }
    });
  }

  return renderGroups;
}
