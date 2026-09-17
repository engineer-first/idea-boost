"use client";

// ボード面。カメラで移動・拡大縮小する世界レイヤーに共有付箋・グループ枠・
// ドラッグ中のゴーストを描き、下端にマイ付箋ドックを重ねる。
// ドラッグの状態機械は持たない（logic/use-board-drag が view で束ねる）。
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { NOTE_WIDTH } from "@/contracts/board";
import {
  calculateRenderGroups,
  type PersistentGroup,
} from "@/contracts/grouping";
import {
  isAtOrAfterGroupingStep,
  isResultStep,
  isVotingStep,
  type RoomPhase,
} from "@/contracts/phase";
import type { DotVoteKind } from "@/contracts/room-protocol";
import type { DotVoteRemaining } from "@/features/dot-vote";
import {
  type Note,
  NoteCard,
  NoteGroupCard,
  PrivateNotesToolbar,
  StickyNote,
} from "@/features/notes";
import type { BoardPermissions } from "../logic/board-permissions";
import { type CanvasCamera, worldToScreen } from "../logic/canvas-camera";
import {
  getCursorLabelOffset,
  type RenderedRemoteCursorPresence,
} from "../logic/cursor-presence";
import { getIdeaValueFeasibilityMapNotePosition } from "../logic/idea-value-feasibility-map";
import type { Decision } from "../logic/room-reducer";
import { BoardOperationMatrix } from "../molecules/board-operation-matrix";
import { CanvasZoomControls } from "../molecules/canvas-zoom-controls";
import {
  DECIDE_NOTE_ACTION_INSET,
  DECIDE_NOTE_ACTION_SIZE,
  DecideNoteAction,
} from "../molecules/decide-note-action";
import { IdeaValueFeasibilityMap } from "../molecules/idea-value-feasibility-map";
import { RemoteCursor } from "../molecules/remote-cursor";

const TEMPORARY_DRAG_Z_INDEX = 2_147_483_647;

export type RoomBoardCanvasProps = {
  notes: Note[];
  groups: PersistentGroup[];
  phase: RoomPhase;
  decision: Decision | null;
  isHost: boolean;
  privateNotes: Note[];
  selectedNoteId: string | null;
  draggingNoteId: string | null;
  isDisconnected: boolean;
  voteRemaining: DotVoteRemaining;
  selectedVoteKind: DotVoteKind | null;
  pendingVoteOperations: ReadonlyArray<{
    noteId: string;
    kind: DotVoteKind;
    stickerId?: string;
  }>;
  // ツールバー発ドラッグ中に、まだ notes に現れていない付箋を描くゴースト。
  dragGhost: { note: Note; x: number; y: number } | null;
  isReturnDropTarget: boolean;
  boardScrollerRef: RefObject<HTMLDivElement | null>;
  ideaMapPlaneRef: RefObject<HTMLDivElement | null>;
  privateToolbarRef: RefObject<HTMLDivElement | null>;
  permissions: BoardPermissions;
  camera: CanvasCamera;
  gridStyle: CSSProperties;
  isPanning: boolean;
  onCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onCanvasPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPresencePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPresencePointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToNotes: () => void;
  onSelect: (noteId: string | null) => void;
  onNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onNoteContentChange: (noteId: string, content: string) => void;
  onNoteDelete: (noteId: string) => void;
  onNoteExclude?: (noteId: string) => void;
  onNoteRestore?: (noteId: string) => void;
  onNoteVote: (noteId: string, kind: DotVoteKind, x: number, y: number) => void;
  onNoteVoteRemove: (noteId: string, kind: DotVoteKind) => void;
  onNoteVoteStickerRemove: (stickerId: string) => void;
  onNoteVoteStickerDragStart: (
    stickerId: string,
    kind: DotVoteKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onNoteDecide: (noteId: string) => void;
  onGroupCreate?: (name: string, noteIds: string[]) => void;
  onGroupUpdateName?: (groupId: string, name: string) => void;
  onAddPrivateNote: () => void;
  onPrivateNoteContentChange: (noteId: string, content: string) => void;
  onPrivateNoteDelete: (noteId: string) => void;
  onPrivateNoteDragStart: (
    noteId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  remoteCursors: RenderedRemoteCursorPresence[];
  expandPrivateNotesRequest?: number;
  addPrivateNoteRequest?: number;
};

export function RoomBoardCanvas({
  notes,
  groups,
  phase,
  decision,
  isHost,
  privateNotes,
  selectedNoteId,
  draggingNoteId,
  isDisconnected,
  voteRemaining,
  selectedVoteKind,
  pendingVoteOperations,
  dragGhost,
  isReturnDropTarget,
  boardScrollerRef,
  ideaMapPlaneRef,
  privateToolbarRef,
  permissions,
  camera,
  gridStyle,
  isPanning,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerEnd,
  onPresencePointerMove,
  onPresencePointerLeave,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToNotes,
  onSelect,
  onNoteDragStart,
  onNoteContentChange,
  onNoteDelete,
  onNoteExclude = () => undefined,
  onNoteRestore = () => undefined,
  onNoteVote,
  onNoteVoteRemove,
  onNoteVoteStickerRemove,
  onNoteVoteStickerDragStart,
  onNoteDecide,
  onGroupCreate,
  onGroupUpdateName,
  onAddPrivateNote,
  onPrivateNoteContentChange,
  onPrivateNoteDelete,
  onPrivateNoteDragStart,
  remoteCursors,
  expandPrivateNotesRequest = 0,
  addPrivateNoteRequest = 0,
}: RoomBoardCanvasProps) {
  const renderGroups = isAtOrAfterGroupingStep(phase)
    ? calculateRenderGroups(notes, groups)
    : [];
  // 候補外を先に描き、通常候補を後から重ねる。z-index も NoteCard / map wrapper
  // で明示し、入力順が変わっても候補外が前面へ戻らないようにする。
  const orderedNotes = [...notes].sort(
    (left, right) => Number(right.excluded) - Number(left.excluded),
  );
  const voteDisplayMode = isVotingStep(phase)
    ? "voting"
    : isResultStep(phase)
      ? "result"
      : "hidden";
  const selectedNote = notes.find((note) => note.id === selectedNoteId);
  const canDecide = Boolean(
    selectedNote &&
      isHost &&
      !isDisconnected &&
      isResultStep(phase) &&
      decision?.noteId !== selectedNote.id &&
      !selectedNote.excluded,
  );
  // アイデア個人執筆中は2軸マップを表示せず、共有する Step3-2 から表示する。
  // 付箋の共有・操作可否は引き続き permissions と RoomDO が権威。
  const isIdeaValueFeasibilityMapVisible =
    phase.kind === "step" && phase.phase === 3 && phase.step >= 2;

  function handleBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // 付箋の上のpointerdownはバブリングしてくるので、ボード背景を
    // 直接押したときだけ選択を解除する。
    if (
      event.button === 0 &&
      (event.target === event.currentTarget ||
        (event.target as HTMLElement).dataset.canvasBackground === "true")
    ) {
      onSelect(null);
    }
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    handleBoardPointerDown(event);
    onCanvasPointerDown(event);
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    onCanvasPointerMove(event);
    onPresencePointerMove(event);
  }

  function handleNoteDelete(noteId: string) {
    if (selectedNoteId === noteId) {
      onSelect(null);
    }
    onNoteDelete(noteId);
  }

  function renderNoteCard(note: Note, isOnIdeaMap = false) {
    const isRemoteDrag =
      !isDisconnected &&
      remoteCursors.some((cursor) => cursor.draggingNoteId === note.id);
    const isTemporarilyFront = draggingNoteId === note.id || isRemoteDrag;
    return (
      <NoteCard
        key={note.id}
        note={note}
        isOwnDrag={draggingNoteId === note.id}
        isSelected={selectedNoteId === note.id}
        editingDisabled={isResultStep(phase)}
        canDeleteNote={permissions.canDeleteNote && !note.excluded}
        canEditNote={permissions.canEditNote && !note.excluded}
        canMoveNote={permissions.canMoveNote && !note.excluded}
        canExcludeNote={isHost && permissions.canExcludeNote && !note.excluded}
        canRestoreNote={isHost && permissions.canRestoreNote && note.excluded}
        isDecided={decision?.noteId === note.id}
        disabled={isDisconnected}
        onSelect={onSelect}
        onDragStart={onNoteDragStart}
        onContentChange={onNoteContentChange}
        onDelete={handleNoteDelete}
        onExclude={onNoteExclude}
        onRestore={onNoteRestore}
        vote={{
          displayMode: voteDisplayMode,
          selectedKind: selectedVoteKind,
          voteRemaining,
          canVote: permissions.canVote && !note.excluded,
          pendingOperations: pendingVoteOperations,
          // 通常のポインター投票は RoomBoardView がパレットからのドロップ座標を
          // 受けて送る。ここはキーボード互換の既存コールバックだけを残す。
          onVote: (noteId, kind) => onNoteVote(noteId, kind, 0.5, 0.5),
          onVoteRemove: onNoteVoteRemove,
          onStickerRemove: onNoteVoteStickerRemove,
          onStickerDragStart: onNoteVoteStickerDragStart,
        }}
        className={isOnIdeaMap ? "relative pointer-events-auto" : undefined}
        style={
          isOnIdeaMap
            ? {}
            : {
                left: note.x,
                top: note.y,
                zIndex: isTemporarilyFront
                  ? TEMPORARY_DRAG_Z_INDEX
                  : note.excluded
                    ? 0
                    : note.stackOrder,
              }
        }
      />
    );
  }

  function renderIdeaMapNote(note: Note) {
    const position = getIdeaValueFeasibilityMapNotePosition({
      value: note.y,
      feasibility: note.x,
    });
    const isSelectedDecidableNote = canDecide && selectedNote?.id === note.id;
    const isRemoteDrag =
      !isDisconnected &&
      remoteCursors.some((cursor) => cursor.draggingNoteId === note.id);
    const isTemporarilyFront = draggingNoteId === note.id || isRemoteDrag;

    return (
      <div
        key={note.id}
        className="pointer-events-auto absolute"
        data-testid={`idea-value-feasibility-map-note-${note.id}`}
        style={{
          ...position,
          zIndex: isTemporarilyFront
            ? TEMPORARY_DRAG_Z_INDEX
            : note.excluded
              ? 0
              : note.stackOrder,
        }}
      >
        {renderNoteCard(note, true)}
        {isSelectedDecidableNote ? (
          <DecideNoteAction
            x={NOTE_WIDTH - DECIDE_NOTE_ACTION_SIZE - DECIDE_NOTE_ACTION_INSET}
            y={DECIDE_NOTE_ACTION_INSET}
            onDecide={() => onNoteDecide(note.id)}
          />
        ) : null}
      </div>
    );
  }

  function renderIdeaMapDragGhost() {
    if (!dragGhost) return null;
    const position = getIdeaValueFeasibilityMapNotePosition({
      value: dragGhost.y,
      feasibility: dragGhost.x,
    });

    return (
      <StickyNote
        noteId={dragGhost.note.id}
        isLifted
        color={dragGhost.note.color}
        className="pointer-events-none absolute"
        style={{ ...position, zIndex: TEMPORARY_DRAG_Z_INDEX }}
      >
        <p className="min-h-0 flex-1 overflow-hidden p-2 text-sm text-slate-900 dark:text-slate-50">
          {dragGhost.note.content || "メモを入力..."}
        </p>
      </StickyNote>
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <div className="relative h-full min-h-80" data-testid="board-frame">
        <div
          ref={boardScrollerRef}
          className={`relative h-full overflow-hidden bg-muted/20 [container-type:size] ${
            selectedVoteKind !== null
              ? "cursor-none"
              : isPanning
                ? "cursor-grabbing"
                : "cursor-grab"
          }`}
          data-testid="board-scroller"
          style={gridStyle}
          onPointerDownCapture={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={onCanvasPointerEnd}
          onPointerCancel={onCanvasPointerEnd}
          onPointerLeave={onPresencePointerLeave}
        >
          <div
            data-testid="board-canvas"
            data-canvas-background="true"
            className={
              isIdeaValueFeasibilityMapVisible
                ? "absolute top-0 left-0 h-full w-full"
                : "absolute top-0 left-0 min-h-full min-w-full"
            }
            style={{
              transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.zoom})`,
              transformOrigin: "0 0",
              willChange: "transform",
            }}
          >
            {isIdeaValueFeasibilityMapVisible ? (
              <IdeaValueFeasibilityMap planeRef={ideaMapPlaneRef}>
                {orderedNotes.map(renderIdeaMapNote)}
                {renderIdeaMapDragGhost()}
                {remoteCursors.map((cursor) => (
                  <RemoteCursor
                    key={cursor.userId}
                    cursor={cursor}
                    isIdle={cursor.isIdle}
                    labelOffset={getCursorLabelOffset(cursor.userId)}
                    style={{
                      left: `${cursor.x}%`,
                      bottom: `${cursor.y}%`,
                      transform: "none",
                    }}
                  />
                ))}
              </IdeaValueFeasibilityMap>
            ) : null}
            {renderGroups.map((rg) => {
              const handleUpdateName = (newName: string) => {
                if (rg.isTemp && rg.representativeNoteId) {
                  const noteIds = rg.id.replace("temp-", "").split(",");
                  onGroupCreate?.(newName, noteIds);
                } else if (rg.persistentGroupId) {
                  onGroupUpdateName?.(rg.persistentGroupId, newName);
                }
              };

              return (
                <NoteGroupCard
                  key={rg.id}
                  group={rg}
                  name={rg.name}
                  canGroupNote={permissions.canGroupNote}
                  onUpdateName={handleUpdateName}
                />
              );
            })}

            {!isIdeaValueFeasibilityMapVisible
              ? orderedNotes.map((note) => renderNoteCard(note))
              : null}
            {isResultStep(phase) &&
            notes.filter((note) => !note.excluded).length === 0 ? (
              <div
                role="status"
                className="absolute top-6 left-1/2 z-30 -translate-x-1/2 rounded-lg border bg-background/95 px-5 py-3 text-sm font-semibold shadow-md"
              >
                候補がありません。候補外の付箋を戻してください。
              </div>
            ) : null}
            {!isIdeaValueFeasibilityMapVisible && canDecide && selectedNote ? (
              <DecideNoteAction
                x={
                  selectedNote.x +
                  NOTE_WIDTH -
                  DECIDE_NOTE_ACTION_SIZE -
                  DECIDE_NOTE_ACTION_INSET
                }
                y={selectedNote.y + DECIDE_NOTE_ACTION_INSET}
                onDecide={() => onNoteDecide(selectedNote.id)}
              />
            ) : null}
            {!isIdeaValueFeasibilityMapVisible && dragGhost ? (
              <StickyNote
                noteId={dragGhost.note.id}
                isLifted
                color={dragGhost.note.color}
                className="pointer-events-none absolute"
                style={{
                  left: dragGhost.x,
                  top: dragGhost.y,
                  zIndex: TEMPORARY_DRAG_Z_INDEX,
                }}
              >
                <p className="min-h-0 flex-1 overflow-hidden p-2 text-sm text-slate-900 dark:text-slate-50">
                  {dragGhost.note.content || "メモを入力..."}
                </p>
              </StickyNote>
            ) : null}
          </div>
          {!isIdeaValueFeasibilityMapVisible
            ? remoteCursors.map((cursor) => (
                <RemoteCursor
                  key={cursor.userId}
                  cursor={{ ...cursor, ...worldToScreen(cursor, camera) }}
                  isIdle={cursor.isIdle}
                  labelOffset={getCursorLabelOffset(cursor.userId)}
                />
              ))
            : null}
        </div>
        <div
          className="pointer-events-none absolute bottom-3 left-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2"
          data-testid="board-tools-hud"
        >
          <div className="flex items-center gap-2">
            <div
              data-testid="board-operation-matrix"
              className="pointer-events-auto"
            >
              <BoardOperationMatrix permissions={permissions} />
            </div>
          </div>
          <div data-testid="canvas-zoom-hud">
            <CanvasZoomControls
              zoom={camera.zoom}
              onZoomOut={onZoomOut}
              onResetZoom={onResetZoom}
              onZoomIn={onZoomIn}
              onFitToNotes={onFitToNotes}
            />
          </div>
        </div>
        {permissions.showPrivateToolbar ? (
          <div
            className="pointer-events-none absolute right-3 bottom-3 top-[4.5rem] group-data-[connection-status=closed]/board:top-[7.5rem] group-data-[connection-status=connecting]/board:top-[7.5rem] z-30 flex w-[min(15rem,calc(100vw-1.5rem))] items-end"
            data-testid="private-notes-dock"
          >
            <PrivateNotesToolbar
              notes={privateNotes}
              disabled={isDisconnected}
              canDeleteNote={permissions.canDeleteNote}
              canCreateNote={permissions.canCreateNote}
              canEditNote={permissions.canEditNote}
              canMoveNote={permissions.canMoveNote}
              editingDisabled={isResultStep(phase)}
              defaultExpanded={false}
              expandRequest={expandPrivateNotesRequest}
              addRequest={addPrivateNoteRequest}
              className="pointer-events-auto max-h-full"
              toolbarRef={privateToolbarRef}
              isReturnDropTarget={isReturnDropTarget}
              selectedNoteId={selectedNoteId}
              onSelect={onSelect}
              onAdd={onAddPrivateNote}
              onContentChange={onPrivateNoteContentChange}
              onDelete={onPrivateNoteDelete}
              onDragStart={onPrivateNoteDragStart}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
