"use client";

// ボード面。カメラで移動・拡大縮小する世界レイヤーに共有付箋・グループ枠・
// ドラッグ中のゴーストを描き、下端にマイ付箋ドックを重ねる。
// ドラッグの状態機械は持たない（logic/use-board-drag が view で束ねる）。
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useEffect, useRef } from "react";
import { getNoteHeight, NOTE_WIDTH } from "@/contracts/board";
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
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import type { BoardPermissions } from "../logic/board-permissions";
import { type CanvasCamera, worldToScreen } from "../logic/canvas-camera";
import {
  getCursorLabelOffset,
  type RenderedRemoteCursorPresence,
} from "../logic/cursor-presence";
import { getIdeaValueFeasibilityMapNotePosition } from "../logic/idea-value-feasibility-map";
import type { Decision } from "../logic/room-reducer";
import { getAdoptionTargetLabel } from "../molecules/adopt-note-control";
import { BoardOperationMatrix } from "../molecules/board-operation-matrix";
import { CanvasZoomControls } from "../molecules/canvas-zoom-controls";
import { IdeaMapSizeControls } from "../molecules/idea-map-size-controls";
import { IdeaValueFeasibilityMap } from "../molecules/idea-value-feasibility-map";
import { NoteFontSizeControls } from "../molecules/note-font-size-controls";
import { RemoteCursor } from "../molecules/remote-cursor";

const TEMPORARY_FRONT_Z_INDEX = 2_147_483_647;
const ADOPTION_TARGET_CLASS_NAME =
  "absolute z-50 cursor-pointer rounded-sm border-4 border-transparent bg-transparent outline-none transition-[border-color,background-color,box-shadow] hover:border-emerald-600 hover:bg-emerald-500/10 focus-visible:border-emerald-600 focus-visible:bg-emerald-500/10 focus-visible:ring-4 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2";

export type RoomBoardCanvasProps = {
  notes: Note[];
  draftScope?: { roomId: string; userId: string };
  groups: PersistentGroup[];
  phase: RoomPhase;
  decision: Decision | null;
  isHost: boolean;
  privateNotes: Note[];
  selectedNoteId: string | null;
  draggingNoteId: string | null;
  isDisconnected: boolean;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
  ideaMapIsDragging?: boolean;
  onIdeaMapResize?: (sizeLevel: number) => void;
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
  onNoteFontSizeChange?: (noteId: string, fontSize: number) => void;
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
  isAdoptMode: boolean;
  adoptionFocusNoteId?: string | null;
  onAdoptionFocusChange?: (noteId: string | null) => void;
  onAdoptNote: (noteId: string) => void;
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
  draftScope,
  groups,
  phase,
  decision,
  isHost,
  privateNotes,
  selectedNoteId,
  draggingNoteId,
  isDisconnected,
  ideaMapSizeLevel = 0,
  ideaMapSizeInitialized = false,
  ideaMapIsDragging = false,
  onIdeaMapResize = () => undefined,
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
  onNoteFontSizeChange = () => undefined,
  onNoteDelete,
  onNoteExclude = () => undefined,
  onNoteRestore = () => undefined,
  onNoteVote,
  onNoteVoteRemove,
  onNoteVoteStickerRemove,
  onNoteVoteStickerDragStart,
  isAdoptMode,
  adoptionFocusNoteId = null,
  onAdoptionFocusChange = () => undefined,
  onAdoptNote,
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
  const adoptionTargetLabel = getAdoptionTargetLabel(
    phase.kind === "step" ? phase.phase : 1,
  );
  // 初回は共有から2軸マップを表示し、個人作業へ再訪しても共有済みの配置を閲覧できる。
  // 付箋の共有・操作可否は引き続き permissions と RoomDO が権威。
  const isIdeaValueFeasibilityMapVisible =
    phase.kind === "step" &&
    phase.phase === 3 &&
    (phase.step >= 2 || notes.length > 0);
  const isIdeaMapSizeControlsVisible =
    phase.kind === "step" &&
    phase.phase === 3 &&
    (phase.step === 2 || phase.step === 3);
  const adoptionPointerNoteIdRef = useRef<string | null>(null);
  const adoptionKeyboardNoteIdRef = useRef<string | null>(null);
  const selectedNote = [...notes, ...privateNotes].find(
    (note) => note.id === selectedNoteId,
  );

  useEffect(() => {
    if (isAdoptMode) return;
    // 候補ボタンは確定・キャンセル時にアンマウントされるため、pointerleave / blur
    // が発火するとは限らない。次に選び直した候補へ前回の focus が勝たないよう、
    // 選択モードを抜けた時点で両モダリティの一時状態を破棄する。
    adoptionPointerNoteIdRef.current = null;
    adoptionKeyboardNoteIdRef.current = null;
  }, [isAdoptMode]);

  function publishAdoptionFocus(): void {
    onAdoptionFocusChange(
      adoptionKeyboardNoteIdRef.current ?? adoptionPointerNoteIdRef.current,
    );
  }

  function handleAdoptionPointerEnter(noteId: string): void {
    adoptionPointerNoteIdRef.current = noteId;
    publishAdoptionFocus();
  }

  function handleAdoptionPointerLeave(noteId: string): void {
    if (adoptionPointerNoteIdRef.current === noteId) {
      adoptionPointerNoteIdRef.current = null;
    }
    publishAdoptionFocus();
  }

  function handleAdoptionFocus(noteId: string): void {
    adoptionKeyboardNoteIdRef.current = noteId;
    publishAdoptionFocus();
  }

  function handleAdoptionBlur(noteId: string): void {
    if (adoptionKeyboardNoteIdRef.current === noteId) {
      adoptionKeyboardNoteIdRef.current = null;
    }
    publishAdoptionFocus();
  }

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
    if (
      isAdoptMode &&
      event.target instanceof Element &&
      event.target.closest("[data-adopt-target]")
    ) {
      return;
    }
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
        draftScope={draftScope}
        isOwnDrag={draggingNoteId === note.id}
        isSelected={selectedNoteId === note.id}
        editingDisabled={isResultStep(phase)}
        canDeleteNote={
          permissions.canDeleteNote &&
          phase.kind === "step" &&
          phase.step !== 1 &&
          !note.excluded
        }
        canEditNote={
          permissions.canEditNote &&
          phase.kind === "step" &&
          phase.step !== 1 &&
          !note.excluded
        }
        canMoveNote={permissions.canMoveNote && !note.excluded}
        canExcludeNote={isHost && permissions.canExcludeNote && !note.excluded}
        canRestoreNote={isHost && permissions.canRestoreNote && note.excluded}
        isDecided={decision?.noteId === note.id}
        isAdoptionFocused={
          !isHost &&
          adoptionFocusNoteId === note.id &&
          decision?.noteId !== note.id
        }
        disabled={isDisconnected || isAdoptMode}
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
                  ? TEMPORARY_FRONT_Z_INDEX
                  : note.excluded
                    ? 0
                    : note.stackOrder,
              }
        }
      />
    );
  }

  function renderIdeaMapNote(note: Note) {
    const position = getIdeaValueFeasibilityMapNotePosition(
      {
        value: note.y,
        feasibility: note.x,
      },
      getNoteHeight(note.content, note.fontSize),
    );
    const isAdoptTarget =
      isAdoptMode &&
      isHost &&
      !isDisconnected &&
      isResultStep(phase) &&
      note.visibility === "shared" &&
      !note.excluded &&
      decision?.noteId !== note.id;
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
            ? TEMPORARY_FRONT_Z_INDEX
            : note.excluded
              ? 0
              : note.stackOrder,
        }}
      >
        {renderNoteCard(note, true)}
        {isAdoptTarget ? (
          <button
            type="button"
            data-adopt-target="true"
            aria-label={`採用する${adoptionTargetLabel}: ${note.content || "内容なし"}`}
            className={`${ADOPTION_TARGET_CLASS_NAME} inset-0`}
            onPointerEnter={() => handleAdoptionPointerEnter(note.id)}
            onPointerLeave={() => handleAdoptionPointerLeave(note.id)}
            onFocus={() => handleAdoptionFocus(note.id)}
            onBlur={() => handleAdoptionBlur(note.id)}
            onClick={() => onAdoptNote(note.id)}
          />
        ) : null}
      </div>
    );
  }

  function renderIdeaMapDragGhost() {
    if (!dragGhost) return null;
    const position = getIdeaValueFeasibilityMapNotePosition(
      {
        value: dragGhost.y,
        feasibility: dragGhost.x,
      },
      getNoteHeight(dragGhost.note.content, dragGhost.note.fontSize),
    );

    return (
      <StickyNote
        noteId={dragGhost.note.id}
        isLifted
        color={dragGhost.note.color}
        height={getNoteHeight(dragGhost.note.content, dragGhost.note.fontSize)}
        className="pointer-events-none absolute"
        style={{ ...position, zIndex: TEMPORARY_FRONT_Z_INDEX }}
      >
        <p
          className="min-h-0 flex-1 overflow-hidden p-2"
          style={{
            color: NOTE_COLOR_STYLES[dragGhost.note.color].foregroundColor,
            fontSize: `${dragGhost.note.fontSize}px`,
            lineHeight: `${Math.ceil(dragGhost.note.fontSize * 1.5)}px`,
          }}
        >
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
            isAdoptMode
              ? "cursor-crosshair"
              : selectedVoteKind !== null
                ? "cursor-none"
                : isPanning
                  ? "cursor-grabbing"
                  : "cursor-grab"
          }`}
          data-testid="board-scroller"
          data-adopt-mode={isAdoptMode || undefined}
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
              <IdeaValueFeasibilityMap
                planeRef={ideaMapPlaneRef}
                sizeLevel={ideaMapSizeLevel}
              >
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
            {!isIdeaValueFeasibilityMapVisible && isAdoptMode
              ? orderedNotes.map((note) => {
                  const isTarget =
                    isHost &&
                    !isDisconnected &&
                    isResultStep(phase) &&
                    note.visibility === "shared" &&
                    !note.excluded &&
                    decision?.noteId !== note.id;
                  return isTarget ? (
                    <button
                      key={`adopt-${note.id}`}
                      type="button"
                      data-adopt-target="true"
                      aria-label={`採用する${adoptionTargetLabel}: ${note.content || "内容なし"}`}
                      className={ADOPTION_TARGET_CLASS_NAME}
                      style={{
                        left: note.x,
                        top: note.y,
                        width: NOTE_WIDTH,
                        height: getNoteHeight(note.content, note.fontSize),
                      }}
                      onPointerEnter={() => handleAdoptionPointerEnter(note.id)}
                      onPointerLeave={() => handleAdoptionPointerLeave(note.id)}
                      onFocus={() => handleAdoptionFocus(note.id)}
                      onBlur={() => handleAdoptionBlur(note.id)}
                      onClick={() => onAdoptNote(note.id)}
                    />
                  ) : null;
                })
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
            {!isIdeaValueFeasibilityMapVisible && dragGhost ? (
              <StickyNote
                noteId={dragGhost.note.id}
                isLifted
                color={dragGhost.note.color}
                height={getNoteHeight(
                  dragGhost.note.content,
                  dragGhost.note.fontSize,
                )}
                className="pointer-events-none absolute"
                style={{
                  left: dragGhost.x,
                  top: dragGhost.y,
                  zIndex: TEMPORARY_FRONT_Z_INDEX,
                }}
              >
                <p
                  className="min-h-0 flex-1 overflow-hidden p-2"
                  style={{
                    color:
                      NOTE_COLOR_STYLES[dragGhost.note.color].foregroundColor,
                    fontSize: `${dragGhost.note.fontSize}px`,
                    lineHeight: `${Math.ceil(dragGhost.note.fontSize * 1.5)}px`,
                  }}
                >
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
            {permissions.canEditNote ? (
              <NoteFontSizeControls
                fontSize={selectedNote?.fontSize ?? null}
                disabled={
                  isDisconnected ||
                  selectedNote === undefined ||
                  selectedNote.excluded ||
                  (phase.kind === "step" &&
                    phase.step === 1 &&
                    selectedNote.visibility === "shared")
                }
                onChange={(fontSize) => {
                  if (selectedNote)
                    onNoteFontSizeChange(selectedNote.id, fontSize);
                }}
              />
            ) : null}
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
        {isIdeaMapSizeControlsVisible ? (
          <div
            className="pointer-events-auto absolute bottom-3 left-1/2 z-40 -translate-x-1/2"
            data-testid="idea-map-size-controls-hud"
          >
            <IdeaMapSizeControls
              sizeLevel={ideaMapSizeLevel}
              initialized={ideaMapSizeInitialized}
              isHost={isHost}
              isDisconnected={isDisconnected}
              isDragging={ideaMapIsDragging}
              onResize={onIdeaMapResize}
            />
          </div>
        ) : null}
        {permissions.showPrivateToolbar ? (
          <div
            className="pointer-events-none absolute right-3 bottom-3 top-[4.5rem] group-data-[connection-status=closed]/board:top-[7.5rem] group-data-[connection-status=connecting]/board:top-[7.5rem] z-30 flex w-[min(15rem,calc(100vw-1.5rem))] items-end"
            data-testid="private-notes-dock"
          >
            <PrivateNotesToolbar
              notes={privateNotes}
              draftScope={draftScope}
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
