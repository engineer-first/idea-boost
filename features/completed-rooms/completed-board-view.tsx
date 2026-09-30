import {
  getIdeaMapDimensions,
  getNoteHeight,
  NOTE_WIDTH,
} from "@/contracts/board";
import type { CompletedBoard } from "@/contracts/completed-rooms";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
export function CompletedBoardView({ board }: { board: CompletedBoard }) {
  const map = board.phase === 3;
  const dimensions = getIdeaMapDimensions(board.ideaMapSizeLevel);
  const notes = [...board.notes]
    .sort((a, b) => a.stackOrder - b.stackOrder)
    .map((note) => ({
      note,
      height: getNoteHeight(note.content, note.fontSize),
      x: map
        ? Math.max(
            0,
            Math.min(
              dimensions.width - NOTE_WIDTH,
              (note.x / 100) * dimensions.width - NOTE_WIDTH / 2,
            ),
          )
        : note.x,
      y: map
        ? Math.max(
            0,
            Math.min(
              dimensions.height - getNoteHeight(note.content, note.fontSize),
              ((100 - note.y) / 100) * dimensions.height -
                getNoteHeight(note.content, note.fontSize) / 2,
            ),
          )
        : note.y,
    }));
  const left = Math.min(0, ...notes.map((n) => n.x)) - 40,
    top = Math.min(0, ...notes.map((n) => n.y)) - 40;
  const width =
      Math.max(
        map ? dimensions.width : 0,
        ...notes.map((n) => n.x + NOTE_WIDTH),
      ) -
      left +
      40,
    height =
      Math.max(
        map ? dimensions.height : 0,
        ...notes.map((n) => n.y + n.height),
      ) -
      top +
      40;
  return (
    <section className="space-y-4" aria-label="当時の共有ボード">
      <h3 className="font-semibold">共有付箋 · {notes.length}枚</h3>
      {notes.length === 0 ? (
        <p>その場面の共有付箋は0枚です。</p>
      ) : (
        <>
          {map && (
            <p className="text-sm leading-6 text-muted-foreground">
              縦軸：価値（上ほど高い）／ 横軸：実現のしやすさ（右ほど高い）
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            配置図の下で、すべての付箋の全文を読めます。
          </p>
          <svg
            role="img"
            aria-label="共有付箋とグループの配置図"
            viewBox={`${left} ${top} ${width} ${height}`}
            className="max-h-[520px] w-full rounded-lg border bg-muted/20"
          >
            <title>当時の共有付箋の配置</title>
            {map && (
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
            {board.groups.map((group) => {
              const members = notes.filter((n) =>
                group.noteIds.includes(n.note.id),
              );
              if (!members.length) return null;
              const x = Math.min(...members.map((n) => n.x)) - 15,
                y = Math.min(...members.map((n) => n.y)) - 30;
              return (
                <g key={group.id}>
                  <rect
                    x={x}
                    y={y}
                    width={
                      Math.max(...members.map((n) => n.x + NOTE_WIDTH)) - x + 15
                    }
                    height={
                      Math.max(...members.map((n) => n.y + n.height)) - y + 15
                    }
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
            {notes.map(({ note, x, y, height: h }) => (
              <g key={note.id} opacity={note.excluded ? 0.5 : 1}>
                <rect
                  x={x}
                  y={y}
                  width={NOTE_WIDTH}
                  height={h}
                  rx={4}
                  fill={NOTE_COLOR_STYLES[note.color].backgroundColor}
                />
                <foreignObject
                  x={x + 8}
                  y={y + 8}
                  width={NOTE_WIDTH - 16}
                  height={h - 16}
                >
                  <div
                    className="whitespace-pre-wrap break-words"
                    style={{
                      fontSize: note.fontSize,
                      color: NOTE_COLOR_STYLES[note.color].foregroundColor,
                    }}
                  >
                    {note.content}
                  </div>
                </foreignObject>
              </g>
            ))}
          </svg>
          <h3 className="font-semibold">付箋の全文</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {notes.map(({ note }) => (
              <li
                key={note.id}
                className="min-w-0 rounded-lg border bg-card p-4"
              >
                <p className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]">
                  {note.content}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {board.decisions.some((d) => d.noteId === note.id) && (
                    <span className="rounded border px-2 py-1 font-semibold">
                      採用済み
                    </span>
                  )}
                  {note.excluded && (
                    <span className="rounded border px-2 py-1">候補外</span>
                  )}
                  {board.groups
                    .filter((g) => g.noteIds.includes(note.id))
                    .map((g) => (
                      <span
                        key={g.id}
                        className="rounded border px-2 py-1 [overflow-wrap:anywhere]"
                      >
                        グループ：{g.name}
                      </span>
                    ))}
                  <span className="py-1">
                    {map
                      ? `実現のしやすさ ${note.x} / 価値 ${note.y}`
                      : `配置 (${note.x}, ${note.y})`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
