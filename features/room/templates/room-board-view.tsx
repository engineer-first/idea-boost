"use client";

// ルームボードの表示用コンポーネント。データ層には一切依存せず、
// 付箋の配列と各種コールバックをpropsで受け取る。
// WebSocket接続・スロットル・プロトコル送信はroom-board.tsx（コンテナ）の責務。
// 「どの付箋を選択中か」「どのダイアログが開いているか」は同期不要な
// 純粋にUIの関心事なので、ここでローカルに持つ。
// 描画の実体はヘッダー（room-board-header）とボード面（room-board-canvas）が
// 持ち、この view は UI 状態と表示用 props・コールバックの配線に徹する。
import { useEffect, useState } from "react";
import type { PersistentGroup } from "@/contracts/grouping";
import { isPhaseStep, isResultStep, type RoomPhase } from "@/contracts/phase";
import {
  DOT_VOTE_LIMITS,
  type DotVoteKind,
  type TimerState,
} from "@/contracts/room-protocol";
import type { Note, RemoteNoteDrag } from "@/features/notes";
import { getBoardPermissions } from "../logic/board-permissions";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import type { RenderedRemoteCursorPresence } from "../logic/cursor-presence";
import type { Decision, Member } from "../logic/room-reducer";
import type { RoomBoardInteractions } from "../logic/use-room-board-interactions";
import { LeaveConfirmDialog } from "../molecules/leave-confirm-dialog";
import { VoteTotalingDialog } from "../molecules/vote-totaling-dialog";
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
  onNoteVote: (noteId: string, kind: DotVoteKind) => void;
  onNoteVoteReset: (noteId: string, kind: DotVoteKind) => void;
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
  onNoteVoteReset,
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

  // 「次のステップへ」を進められない状態。
  // - 結果ステップ: 決定が確定するまで進めない（サーバーの遷移ゲートと対の
  //   UI 側の入口無効化）
  const isNextPhaseBlocked = isResultStep(phase) && decision === null;
  const isSprintComplete = isPhaseStep(phase, 3, 5) && decision?.phase === 3;

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
      className={`group/board relative flex h-full flex-col ${
        isNoteDragging ? "cursor-grabbing" : ""
      }`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <RoomBoardHeader
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
        voteRemaining={voteRemaining}
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
      />

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
        dragGhost={dragGhost}
        isReturnDropTarget={isReturnDropTarget}
        hmwDecidedIssue={hmwDecidedIssue}
        decidedHmw={decidedHmw}
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
        onHmwTemplateSelect={onHmwTemplateSelect}
        onIdeaHintSelect={onIdeaHintSelect}
        onNoteDragStart={handleSharedNoteDragStart}
        onNoteContentChange={onNoteContentChange}
        onNoteDelete={onNoteDelete}
        onNoteVote={onNoteVote}
        onNoteVoteReset={onNoteVoteReset}
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
