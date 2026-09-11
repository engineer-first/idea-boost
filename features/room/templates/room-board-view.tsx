"use client";

// ルームボードの表示用コンポーネント。データ層には一切依存せず、
// 付箋の配列と各種コールバックをpropsで受け取る。
// WebSocket接続・スロットル・プロトコル送信はroom-board.tsx（コンテナ）の責務。
// 「どの付箋を選択中か」「どのダイアログが開いているか」は同期不要な
// 純粋にUIの関心事なので、ここでローカルに持つ。
// 描画の実体はヘッダー（room-board-header）とボード面（room-board-canvas）が
// 持ち、この view は UI 状態と表示用 props・コールバックの配線に徹する。
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { DRAG_THRESHOLD_PX } from "@/contracts/board";
import type { PersistentGroup } from "@/contracts/grouping";
import {
  isPhaseStep,
  isResultStep,
  isVotingStep,
  type RoomPhase,
} from "@/contracts/phase";
import {
  DOT_VOTE_LIMITS,
  type DotVoteKind,
  type TimerState,
} from "@/contracts/room-protocol";
import { DotVotePalette, DotVoteSticker } from "@/features/dot-vote";
import type { Note, RemoteNoteDrag } from "@/features/notes";
import { getBoardPermissions } from "../logic/board-permissions";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import type { RenderedRemoteCursorPresence } from "../logic/cursor-presence";
import type { Decision, Member } from "../logic/room-reducer";
import type { BoardHelpControls } from "../logic/use-board-help";
import type { RoomBoardInteractions } from "../logic/use-room-board-interactions";
import { LeaveConfirmDialog } from "../molecules/leave-confirm-dialog";
import { VoteTotalingDialog } from "../molecules/vote-totaling-dialog";
import { BoardHelpPanel } from "../organisms/board-help-panel";
import { RoomBoardCanvas } from "../organisms/room-board-canvas";
import { RoomBoardHeader } from "../organisms/room-board-header";

export type RoomBoardViewProps = {
  notes: Note[];
  groups: PersistentGroup[];
  inviteCode: string;
  inviteUrl: string;
  phase: RoomPhase;
  timer: TimerState;
  timerServerOffsetMs: number;
  isHost: boolean;
  decision: Decision | null;
  // WebSocket 接続の表示用状態。値の生成は room-board（コンテナ）の責務で、
  // ここでは受け取った状態を表示するだけ（このコンポーネントはデータ層に依存しない）。
  connectionStatus: RoomScreenConnectionStatus;
  draggingNoteId: string | null;
  members: Member[];
  currentUserId: string;
  // ホストの userId（メンバー一覧の「ホスト」ラベル表示用）。
  hostUserId: string;
  isNextPhasePending: boolean;
  interactions: RoomBoardInteractions;
  help: BoardHelpControls;
  remoteCursors: RenderedRemoteCursorPresence[];
  remoteNoteDrags: RemoteNoteDrag[];
  areCursorsVisible: boolean;
  onToggleCursors: () => void;
  signOutAction?: () => Promise<void>;
  // ボード上に掲示する、フェーズ1から持ち越された決定課題の本文。
  // 解決（carryovers からの取り出し）はコンテナの責務。null なら非表示。
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
  onAddPrivateNote: () => void;
  // Step 2-1 でテンプレート・具体例を起点に付箋を作る。
  onHmwTemplateSelect: (content: string) => void;
  onIdeaHintSelect: (content: string) => void;
  onPrivateNoteContentChange: (noteId: string, content: string) => void;
  onPrivateNoteDelete: (noteId: string) => void;
  onNoteContentChange: (noteId: string, content: string) => void;
  onNoteDelete: (noteId: string) => void;
  onGroupCreate?: (name: string, noteIds: string[]) => void;
  onGroupUpdateName?: (groupId: string, name: string) => void;
  onNoteVote: (noteId: string, kind: DotVoteKind, x: number, y: number) => void;
  onNoteVoteRemove: (noteId: string, kind: DotVoteKind) => void;
  onNoteVoteStickerRemove: (stickerId: string) => void;
  onNoteVoteStickerMove: (
    stickerId: string,
    noteId: string,
    x: number,
    y: number,
  ) => void;
  pendingVoteOperations: ReadonlyArray<{
    noteId: string;
    kind: DotVoteKind;
    stickerId?: string;
  }>;
  voteFeedback: { state: "confirmed" | "failed"; message: string } | null;
  onNoteDecide: (noteId: string) => void;
  // 退出。
  onLeave: () => void;
  // 退出処理中（多重押下防止）。true の間「退出する」ボタンは disabled。
  isLeaving: boolean;
  // 次フェーズへ。ホストのみ UI 表示。
  onNextPhase: () => void;
  onTimerStart: (durationMs: number) => void;
  onTimerPause: () => void;
  onTimerResume: () => void;
  onTimerExtend: () => void;
  onTimerStop: () => void;
};

type VoteStickerDrag = {
  stickerId: string | null;
  kind: DotVoteKind;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  clientX: number;
  clientY: number;
  didDrag: boolean;
};

type VoteStampPointer = {
  clientX: number;
  clientY: number;
};

export function RoomBoardView({
  notes,
  groups,
  inviteCode,
  inviteUrl,
  phase,
  timer,
  timerServerOffsetMs,
  isHost,
  decision,
  connectionStatus,
  draggingNoteId,
  members,
  currentUserId,
  hostUserId,
  isNextPhasePending,
  interactions,
  help,
  remoteCursors,
  remoteNoteDrags,
  areCursorsVisible,
  onToggleCursors,
  signOutAction,
  hmwDecidedIssue,
  decidedHmw,
  onAddPrivateNote,
  onHmwTemplateSelect,
  onIdeaHintSelect,
  onPrivateNoteContentChange,
  onPrivateNoteDelete,
  onNoteContentChange,
  onNoteDelete,
  onGroupCreate,
  onGroupUpdateName,
  onNoteVote,
  onNoteVoteRemove,
  onNoteVoteStickerRemove,
  onNoteVoteStickerMove,
  pendingVoteOperations,
  voteFeedback,
  onNoteDecide,
  onLeave,
  isLeaving,
  onNextPhase,
  onTimerStart,
  onTimerPause,
  onTimerResume,
  onTimerExtend,
  onTimerStop,
}: RoomBoardViewProps) {
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [voteTotalingDialogOpen, setVoteTotalingDialogOpen] = useState(false);
  const [voteStickerDrag, setVoteStickerDrag] =
    useState<VoteStickerDrag | null>(null);
  const voteStickerDragRef = useRef<VoteStickerDrag | null>(null);
  const [selectedVoteKind, setSelectedVoteKind] = useState<DotVoteKind | null>(
    null,
  );
  const [voteStampPointer, setVoteStampPointer] =
    useState<VoteStampPointer | null>(null);
  const suppressPaletteSelectRef = useRef(false);
  const [guideDisplay, setGuideDisplay] = useState({
    phaseKey,
    isExpanded: true,
  });

  const [isMounted, setIsMounted] = useState(false);
  const isGuideExpanded =
    guideDisplay.phaseKey === phaseKey ? guideDisplay.isExpanded : true;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setVoteTotalingDialogOpen(isResultStep(phase));
  }, [phase]);

  useEffect(() => {
    if (isVotingStep(phase)) return;
    voteStickerDragRef.current = null;
    setVoteStickerDrag(null);
    setSelectedVoteKind(null);
    setVoteStampPointer(null);
  }, [phase]);

  // ハイドレーション直後の高速接続確立によるMismatchedを防ぐため、マウント完了までは接続中（非活性）扱いにする
  const isDisconnected = isMounted ? connectionStatus !== "open" : true;
  const permissions = getBoardPermissions(phase);
  const voteRemaining = {
    subjective: Math.max(
      0,
      DOT_VOTE_LIMITS.subjective -
        notes.reduce(
          (used, note) => used + note.dotVotes.subjective.ownCount,
          0,
        ),
    ),
    objective: Math.max(
      0,
      DOT_VOTE_LIMITS.objective -
        notes.reduce(
          (used, note) => used + note.dotVotes.objective.ownCount,
          0,
        ),
    ),
  };
  const selectedVoteRemaining =
    selectedVoteKind === null ? null : voteRemaining[selectedVoteKind];

  useEffect(() => {
    if (
      selectedVoteRemaining === null ||
      (!isDisconnected && selectedVoteRemaining > 0)
    ) {
      return;
    }
    setSelectedVoteKind(null);
    setVoteStampPointer(null);
  }, [isDisconnected, selectedVoteRemaining]);

  // 「次のステップへ」を進められない状態。
  // - 結果ステップ: 決定が確定するまで進めない（サーバーの遷移ゲートと対の
  //   UI 側の入口無効化）
  const isNextPhaseBlocked = isResultStep(phase) && decision === null;
  const isSprintComplete = isPhaseStep(phase, 3, 5) && decision?.phase === 3;

  function noteElementAt(clientX: number, clientY: number): HTMLElement | null {
    const target = document.elementFromPoint(clientX, clientY);
    const note = target?.closest<HTMLElement>("[data-note-id]") ?? null;
    if (!note || !renderedNotes.some(({ id }) => id === note.dataset.noteId)) {
      return null;
    }
    return note;
  }

  function handlePaletteStickerDragStart(
    kind: DotVoteKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (isDisconnected || !isVotingStep(phase) || voteRemaining[kind] <= 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next: VoteStickerDrag = {
      stickerId: null,
      kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      didDrag: false,
    };
    voteStickerDragRef.current = next;
    setVoteStickerDrag(next);
  }

  function handleVoteStickerDragStart(
    stickerId: string,
    kind: DotVoteKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (isDisconnected || !isVotingStep(phase)) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next: VoteStickerDrag = {
      stickerId,
      kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      didDrag: false,
    };
    voteStickerDragRef.current = next;
    setVoteStickerDrag(next);
  }

  function handleRootPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (selectedVoteKind !== null && event.pointerType !== "touch") {
      setVoteStampPointer({
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }
    const current = voteStickerDragRef.current;
    if (current?.pointerId === event.pointerId) {
      const didDrag =
        current.didDrag ||
        Math.hypot(
          event.clientX - current.startClientX,
          event.clientY - current.startClientY,
        ) >= DRAG_THRESHOLD_PX;
      const next = {
        ...current,
        clientX: event.clientX,
        clientY: event.clientY,
        didDrag,
      };
      if (!current.didDrag && didDrag && current.stickerId === null) {
        setSelectedVoteKind(null);
        setVoteStampPointer(null);
      }
      voteStickerDragRef.current = next;
      setVoteStickerDrag(next);
      return;
    }
    handlePointerMove(event);
  }

  function handleRootPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const current = voteStickerDragRef.current;
    if (current?.pointerId === event.pointerId) {
      if (current.didDrag && !isDisconnected && isVotingStep(phase)) {
        event.preventDefault();
        const note = noteElementAt(event.clientX, event.clientY);
        if (note) {
          const rect = note.getBoundingClientRect();
          const noteId = note.dataset.noteId;
          if (noteId && rect.width > 0 && rect.height > 0) {
            const x = Math.min(
              1,
              Math.max(0, (event.clientX - rect.left) / rect.width),
            );
            const y = Math.min(
              1,
              Math.max(0, (event.clientY - rect.top) / rect.height),
            );
            if (current.stickerId === null) {
              onNoteVote(noteId, current.kind, x, y);
            } else {
              onNoteVoteStickerMove(current.stickerId, noteId, x, y);
            }
          }
        }
      }
      if (current.didDrag && current.stickerId === null) {
        suppressPaletteSelectRef.current = true;
        globalThis.setTimeout(() => {
          suppressPaletteSelectRef.current = false;
        }, 0);
      }
      voteStickerDragRef.current = null;
      setVoteStickerDrag(null);
      return;
    }
    handlePointerEnd(event);
  }

  function handlePaletteStickerSelect(
    kind: DotVoteKind,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    if (suppressPaletteSelectRef.current) {
      suppressPaletteSelectRef.current = false;
      return;
    }
    if (isDisconnected || !isVotingStep(phase) || voteRemaining[kind] <= 0) {
      return;
    }
    const nextKind = selectedVoteKind === kind ? null : kind;
    setSelectedVoteKind(nextKind);
    setVoteStampPointer(
      nextKind === null
        ? null
        : { clientX: event.clientX, clientY: event.clientY },
    );
  }

  function handleRootClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (
      selectedVoteKind === null ||
      isDisconnected ||
      !isVotingStep(phase) ||
      voteRemaining[selectedVoteKind] <= 0
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-vote-sticker-id]")) return;

    const note = target.closest<HTMLElement>("[data-note-id]");
    const noteId = note?.dataset.noteId;
    if (!note || !noteId || !renderedNotes.some(({ id }) => id === noteId)) {
      return;
    }
    const rect = note.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    const x = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    const y = Math.min(
      1,
      Math.max(0, (event.clientY - rect.top) / rect.height),
    );
    onNoteVote(noteId, selectedVoteKind, x, y);
    setVoteStampPointer({ clientX: event.clientX, clientY: event.clientY });
    if (voteRemaining[selectedVoteKind] === 1) {
      setSelectedVoteKind(null);
      setVoteStampPointer(null);
    }
  }

  function handleRootPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (voteStickerDragRef.current?.pointerId === event.pointerId) {
      voteStickerDragRef.current = null;
      setVoteStickerDrag(null);
      return;
    }
    handlePointerEnd(event);
  }

  useEffect(() => {
    if (selectedVoteKind === null) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSelectedVoteKind(null);
      setVoteStampPointer(null);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedVoteKind]);

  const {
    boardRootRef,
    boardScrollerRef,
    ideaMapPlaneRef,
    privateToolbarRef,
    notes: renderedNotes,
    privateNotes: toolbarNotes,
    dragGhost,
    isReturnDropTarget,
    isNoteDragging,
    camera,
    gridStyle,
    isPanning,
    onCanvasPointerDown: handleCanvasPointerDown,
    onCanvasPointerMove: handleCanvasPointerMove,
    onCanvasPointerEnd: handleCanvasPointerEnd,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onResetZoom: resetZoom,
    onFitToNotes: fitToNotes,
    onPointerMove: handlePointerMove,
    onPointerEnd: handlePointerEnd,
    onPresencePointerMove: handlePresencePointerMove,
    onPresencePointerLeave: handlePresencePointerLeave,
    onNoteDragStart: handleSharedNoteDragStart,
    onPrivateNoteDragStart: handlePrivateDragStart,
  } = interactions;

  return (
    <div
      ref={boardRootRef}
      data-testid="room-board-view-root"
      data-guide-expanded={String(isGuideExpanded)}
      data-connection-status={connectionStatus}
      className={`group/board relative flex h-full min-h-0 flex-col overflow-hidden ${
        isNoteDragging
          ? "cursor-grabbing"
          : selectedVoteKind !== null
            ? "cursor-crosshair"
            : ""
      }`}
      onClickCapture={handleRootClickCapture}
      onPointerMove={handleRootPointerMove}
      onPointerUp={handleRootPointerEnd}
      onPointerCancel={handleRootPointerCancel}
      onPointerLeave={() => setVoteStampPointer(null)}
    >
      <RoomBoardHeader
        hmwDecidedIssue={hmwDecidedIssue}
        decidedHmw={decidedHmw}
        inviteCode={inviteCode}
        inviteUrl={inviteUrl}
        phase={phase}
        timer={timer}
        timerServerOffsetMs={timerServerOffsetMs}
        isHost={isHost}
        isDisconnected={isDisconnected}
        connectionStatus={connectionStatus}
        members={members}
        currentUserId={currentUserId}
        hostUserId={hostUserId}
        isNextPhasePending={isNextPhasePending}
        isNextPhaseBlocked={isNextPhaseBlocked}
        isGuideExpanded={isGuideExpanded}
        isSprintComplete={isSprintComplete}
        signOutAction={signOutAction}
        isLeaving={isLeaving}
        onShowVoteResult={() => setVoteTotalingDialogOpen(true)}
        onGuideExpandedChange={(isExpanded) =>
          setGuideDisplay({ phaseKey, isExpanded })
        }
        onLeaveClick={() => setLeaveDialogOpen(true)}
        onNextPhase={onNextPhase}
        onTimerStart={onTimerStart}
        onTimerPause={onTimerPause}
        onTimerResume={onTimerResume}
        onTimerExtend={onTimerExtend}
        onTimerStop={onTimerStop}
      >
        <BoardHelpPanel
          {...help}
          disabled={isDisconnected}
          onHmwTemplateSelect={onHmwTemplateSelect}
          onIdeaHintSelect={onIdeaHintSelect}
        />
      </RoomBoardHeader>

      <RoomBoardCanvas
        notes={renderedNotes}
        groups={groups}
        phase={phase}
        permissions={permissions}
        decision={decision}
        isHost={isHost}
        privateNotes={toolbarNotes}
        selectedNoteId={selectedNoteId}
        draggingNoteId={draggingNoteId}
        isDisconnected={isDisconnected}
        voteRemaining={voteRemaining}
        selectedVoteKind={selectedVoteKind}
        pendingVoteOperations={pendingVoteOperations}
        dragGhost={dragGhost}
        isReturnDropTarget={isReturnDropTarget}
        boardScrollerRef={boardScrollerRef}
        ideaMapPlaneRef={ideaMapPlaneRef}
        privateToolbarRef={privateToolbarRef}
        camera={camera}
        gridStyle={gridStyle}
        isPanning={isPanning}
        onCanvasPointerDown={handleCanvasPointerDown}
        onCanvasPointerMove={handleCanvasPointerMove}
        onCanvasPointerEnd={handleCanvasPointerEnd}
        onPresencePointerMove={handlePresencePointerMove}
        onPresencePointerLeave={handlePresencePointerLeave}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onFitToNotes={fitToNotes}
        onSelect={setSelectedNoteId}
        onNoteDragStart={handleSharedNoteDragStart}
        onNoteContentChange={onNoteContentChange}
        onNoteDelete={onNoteDelete}
        onNoteVote={onNoteVote}
        onNoteVoteRemove={onNoteVoteRemove}
        onNoteVoteStickerRemove={onNoteVoteStickerRemove}
        onNoteVoteStickerDragStart={handleVoteStickerDragStart}
        onNoteDecide={onNoteDecide}
        onGroupCreate={onGroupCreate}
        onGroupUpdateName={onGroupUpdateName}
        onAddPrivateNote={onAddPrivateNote}
        onPrivateNoteContentChange={onPrivateNoteContentChange}
        onPrivateNoteDelete={onPrivateNoteDelete}
        onPrivateNoteDragStart={handlePrivateDragStart}
        remoteCursors={remoteCursors}
        remoteNoteDrags={remoteNoteDrags}
        areCursorsVisible={areCursorsVisible}
        onToggleCursors={onToggleCursors}
      />

      {isVotingStep(phase) ? (
        <div
          className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-center"
          data-testid="vote-palette-hud"
        >
          <DotVotePalette
            voteRemaining={voteRemaining}
            pendingOperationCount={pendingVoteOperations.length}
            feedback={voteFeedback}
            disabled={isDisconnected}
            selectedKind={selectedVoteKind}
            onStickerSelect={handlePaletteStickerSelect}
            onStickerDragStart={handlePaletteStickerDragStart}
          />
        </div>
      ) : null}

      {voteStickerDrag !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: voteStickerDrag.clientX,
            top: voteStickerDrag.clientY,
          }}
        >
          <DotVoteSticker
            kind={voteStickerDrag.kind}
            count={1}
            state="preview"
          />
        </div>
      ) : null}

      {selectedVoteKind !== null &&
      voteStampPointer !== null &&
      voteStickerDrag === null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          data-testid="vote-stamp-cursor"
          style={{
            left: voteStampPointer.clientX,
            top: voteStampPointer.clientY,
          }}
        >
          <DotVoteSticker kind={selectedVoteKind} count={1} state="preview" />
        </div>
      ) : null}

      <VoteTotalingDialog
        open={voteTotalingDialogOpen}
        onOpenChange={setVoteTotalingDialogOpen}
        isVotingComplete={isResultStep(phase)}
        members={members}
        notes={notes}
        decision={decision}
        isHost={isHost}
        isDisconnected={isDisconnected}
        onNoteDecide={onNoteDecide}
      />

      <LeaveConfirmDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onConfirm={onLeave}
        isLeaving={isLeaving}
        mode={isHost ? "disband" : "leave"}
      />
    </div>
  );
}
