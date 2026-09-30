import {
  getIdeaMapDimensions,
  getNoteHeight,
  NOTE_WIDTH,
} from "@/contracts/board";
import type { SharedOutcomeSnapshot } from "@/contracts/shared-outcomes";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
export type SharedOutcomeBoardProps = {
  label: string;
  phase: number;
  snapshot: SharedOutcomeSnapshot;
};
export function SharedOutcomeBoard({
  label,
  phase,
  snapshot,
}: SharedOutcomeBoardProps) {
  const notes = snapshot.notes
    .filter((note) => note.phase === phase)
    .sort((a, b) => a.stackOrder - b.stackOrder);
  if (!notes.length)
    return (
      <p className="rounded-xl border bg-card p-6">
        {label}の共有付箋はありません。
      </p>
    );
  // 書き足しでStep1に戻っても、共有済みアイデアの2軸座標は保持される。
  const isMap = phase === 3;
  const dimensions = getIdeaMapDimensions(snapshot.ideaMapSizeLevel);
  const positions = notes.map((note) => ({
    note,
    x: isMap
      ? Math.max(
          0,
          Math.min(
            dimensions.width - NOTE_WIDTH,
            (note.x / 100) * dimensions.width - NOTE_WIDTH / 2,
          ),
        )
      : note.x,
    y: isMap
      ? Math.max(
          0,
          Math.min(
            dimensions.height - getNoteHeight(note.content, note.fontSize),
            ((100 - note.y) / 100) * dimensions.height -
              getNoteHeight(note.content, note.fontSize) / 2,
          ),
        )
      : note.y,
    height: getNoteHeight(note.content, note.fontSize),
  }));
  const left = Math.min(0, ...positions.map((item) => item.x)) - 40;
  const top = Math.min(0, ...positions.map((item) => item.y)) - 40;
  const width =
    Math.max(
      isMap ? dimensions.width : 0,
      ...positions.map((item) => item.x + NOTE_WIDTH),
    ) -
    left +
    40;
  const height =
    Math.max(
      isMap ? dimensions.height : 0,
      ...positions.map((item) => item.y + item.height),
    ) -
    top +
    40;
  return (
    <article className="space-y-4 rounded-xl border bg-card p-5">
      <h3 className="font-semibold">
        {label}の共有付箋 · {notes.length}枚
      </h3>
      {isMap && (
        <p className="text-sm text-muted-foreground">
          縦軸：価値（上ほど高い） · 横軸：実現のしやすさ（右ほど高い）
        </p>
      )}
      <section
        className="rounded-lg border bg-muted/20"
        aria-label={`${label}の配置図`}
      >
        <svg
          viewBox={`${left} ${top} ${width} ${height}`}
          className="w-full max-h-[650px]"
          role="img"
          aria-label={`${label}の付箋とグループの配置。本文は下の一覧でも読めます。`}
        >
          <title>{label}の共有ボード</title>
          {isMap && (
            <g className="stroke-border" strokeWidth={3}>
              <line
                x1={dimensions.width / 2}
                x2={dimensions.width / 2}
                y1={0}
                y2={dimensions.height}
              />
              <line
                x1={0}
                x2={dimensions.width}
                y1={dimensions.height / 2}
                y2={dimensions.height / 2}
              />
            </g>
          )}
          {snapshot.groups.map((group) => {
            const members = positions.filter((item) =>
              group.noteIds.includes(item.note.id),
            );
            if (!members.length) return null;
            const x = Math.min(...members.map((item) => item.x)) - 15;
            const y = Math.min(...members.map((item) => item.y)) - 30;
            const right =
              Math.max(...members.map((item) => item.x + NOTE_WIDTH)) + 15;
            const bottom =
              Math.max(...members.map((item) => item.y + item.height)) + 15;
            return (
              <g key={group.id}>
                <rect
                  x={x}
                  y={y}
                  width={right - x}
                  height={bottom - y}
                  rx={12}
                  className="fill-primary/5 stroke-primary/40"
                  strokeWidth={2}
                />
                <text
                  x={x + 8}
                  y={y + 20}
                  className="fill-foreground"
                  fontSize={14}
                >
                  {group.name}
                </text>
              </g>
            );
          })}
          {positions.map(({ note, x, y, height: noteHeight }) => (
            <g key={note.id} opacity={note.excluded ? 0.5 : 1}>
              <rect
                x={x}
                y={y}
                width={NOTE_WIDTH}
                height={noteHeight}
                rx={4}
                fill={NOTE_COLOR_STYLES[note.color].backgroundColor}
                className="stroke-border"
                strokeWidth={2}
              />
              <foreignObject
                x={x + 8}
                y={y + 8}
                width={NOTE_WIDTH - 16}
                height={noteHeight - 16}
              >
                <div
                  className="whitespace-pre-wrap break-words text-slate-900"
                  style={{ fontSize: note.fontSize }}
                >
                  {note.content}
                  {snapshot.decisions.some(
                    (decision) => decision.noteId === note.id,
                  ) && <p className="mt-2 text-xs font-semibold">採用済み</p>}
                  {note.votes && (
                    <p className="mt-1 text-xs">
                      主観 {note.votes.subjective}票 / 客観{" "}
                      {note.votes.objective}票 / 合計{" "}
                      {note.votes.subjective + note.votes.objective}票
                    </p>
                  )}
                  {note.excluded && (
                    <p className="mt-2 text-xs font-semibold">候補外</p>
                  )}
                </div>
              </foreignObject>
            </g>
          ))}
        </svg>
      </section>
      <ul className="grid gap-3 sm:grid-cols-2">
        {notes.map((note) => {
          const group = snapshot.groups.find((item) =>
            item.noteIds.includes(note.id),
          );
          return (
            <li key={note.id} className="rounded-lg border p-4">
              <p className="whitespace-pre-wrap break-words leading-relaxed">
                {note.content}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {snapshot.decisions.some(
                  (decision) => decision.noteId === note.id,
                ) && (
                  <span className="rounded border border-emerald-700 bg-emerald-50 px-2 py-1 font-semibold text-emerald-900">
                    採用済み
                  </span>
                )}
                {note.excluded && (
                  <span className="rounded border px-2 py-1">候補外</span>
                )}
                {group && (
                  <span className="rounded border px-2 py-1">
                    グループ：{group.name}
                  </span>
                )}
                <span className="py-1">
                  {isMap
                    ? `実現のしやすさ ${note.x} / 価値 ${note.y}`
                    : `配置 (${note.x}, ${note.y})`}
                </span>
              </div>
              {note.votes && (
                <p className="mt-3 text-sm text-muted-foreground">
                  主観 {note.votes.subjective}票 / 客観 {note.votes.objective}票
                  / 合計 {note.votes.subjective + note.votes.objective}票
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
