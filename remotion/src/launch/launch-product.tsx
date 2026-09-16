import { useRef } from "react";
import type { ProtocolNote } from "@/contracts/room-protocol";
import { NoteCard, PrivateNotesToolbar, StickyNote } from "@/features/notes";
import { type RoomBoardInteractions, RoomBoardView } from "@/features/room";
import { LAUNCH_COPY, LAUNCH_MEMBERS, type LaunchState } from "./launch-state";

export const noop = () => undefined;

export function LaunchBoard({ state }: { state: LaunchState }) {
  const boardRootRef = useRef<HTMLDivElement>(null);
  const boardScrollerRef = useRef<HTMLDivElement>(null);
  const ideaMapPlaneRef = useRef<HTMLDivElement>(null);
  const privateToolbarRef = useRef<HTMLDivElement>(null);
  const data = state.board;
  const interactions: RoomBoardInteractions = {
    boardRootRef,
    boardScrollerRef,
    ideaMapPlaneRef,
    privateToolbarRef,
    notes: data.notes,
    privateNotes: data.privateNotes,
    dragGhost: data.dragGhost,
    isReturnDropTarget: false,
    isNoteDragging: data.draggingNoteId !== null,
    camera: { x: 0, y: 0, zoom: 1 },
    gridStyle: {
      backgroundImage:
        "radial-gradient(circle at 1px 1px, #78708440 1px, transparent 1.5px)",
      backgroundSize: "20px 20px",
    },
    isPanning: false,
    onCanvasPointerDown: noop,
    onCanvasPointerMove: noop,
    onCanvasPointerEnd: noop,
    onZoomIn: noop,
    onZoomOut: noop,
    onResetZoom: noop,
    onFitToNotes: noop,
    onPointerMove: noop,
    onPointerEnd: noop,
    onPresencePointerMove: noop,
    onPresencePointerLeave: noop,
    onNoteDragStart: noop,
    onPrivateNoteDragStart: noop,
  };
  return (
    <div
      className="launch-live-board"
      style={{ width: 1728, height: 972, position: "relative" }}
    >
      <RoomBoardView
        notes={data.notes}
        groups={data.groups}
        inviteCode={LAUNCH_COPY.roomCode}
        inviteUrl=""
        phase={state.moment.phase ?? { kind: "step", phase: 1, step: 1 }}
        timer={state.timer}
        timerServerOffsetMs={0}
        renderTimeMs={state.renderTimeMs}
        isHost
        decision={data.decision}
        connectionStatus="open"
        renderMode="deterministic"
        draggingNoteId={data.draggingNoteId}
        members={LAUNCH_MEMBERS}
        currentUserId={state.currentUserId}
        hostUserId={state.currentUserId}
        isNextPhasePending={false}
        interactions={interactions}
        help={{
          kind: null,
          isOpen: false,
          tab: "write",
          onOpenChange: noop,
          onTabChange: noop,
        }}
        remoteCursors={data.remoteCursors}
        remoteNoteDrags={data.remoteNoteDrags}
        areCursorsVisible
        onToggleCursors={noop}
        hmwDecidedIssue={data.hmwDecidedIssue}
        decidedHmw={data.decidedHmw}
        onAddPrivateNote={noop}
        onHmwTemplateSelect={noop}
        onIdeaHintSelect={noop}
        onPrivateNoteContentChange={noop}
        onPrivateNoteDelete={noop}
        onNoteContentChange={noop}
        onNoteDelete={noop}
        onNoteVote={noop}
        onNoteVoteRemove={noop}
        onNoteVoteStickerRemove={noop}
        onNoteVoteStickerMove={noop}
        pendingVoteOperations={[]}
        voteFeedback={null}
        onNoteDecide={noop}
        onLeave={noop}
        isLeaving={false}
        onNextPhase={noop}
        onTimerStart={noop}
        onTimerPause={noop}
        onTimerResume={noop}
        onTimerExtend={noop}
        onTimerStop={noop}
      />
      {data.viewportDragGhost && (
        <div
          style={{
            position: "absolute",
            left: data.viewportDragGhost.x,
            top: data.viewportDragGhost.y,
            zIndex: 100,
          }}
        >
          <StickyNote
            noteId={data.viewportDragGhost.note.id}
            color={data.viewportDragGhost.note.color}
            isLifted
          >
            <p className="p-2 text-sm">{data.viewportDragGhost.note.content}</p>
          </StickyNote>
        </div>
      )}
    </div>
  );
}

export function LaunchPrivateDock({ state }: { state: LaunchState }) {
  return (
    <PrivateNotesToolbar
      notes={state.board.privateNotes}
      disabled={false}
      canEditNote
      canCreateNote
      canDeleteNote
      canMoveNote
      selectedNoteId={null}
      defaultExpanded
      onSelect={noop}
      onAdd={noop}
      onContentChange={noop}
      onDelete={noop}
      onDragStart={noop}
    />
  );
}

export function LaunchNote({
  note,
  decided = false,
  results = false,
}: {
  note: ProtocolNote;
  decided?: boolean;
  results?: boolean;
}) {
  return (
    <NoteCard
      note={{ ...note, x: 0, y: 0 }}
      isOwnDrag={false}
      isSelected={false}
      isDecided={decided}
      canEditNote={false}
      canDeleteNote={false}
      canMoveNote={false}
      onSelect={noop}
      onDragStart={noop}
      onContentChange={noop}
      onDelete={noop}
      vote={{
        displayMode: results ? "result" : "voting",
        selectedKind: null,
        voteRemaining: { subjective: 1, objective: 3 },
        canVote: false,
        pendingOperations: [],
        onVote: noop,
        onVoteRemove: noop,
      }}
    />
  );
}
