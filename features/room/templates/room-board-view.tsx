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
import type { SharingState } from "@/contracts/room-protocol";
import {
  DOT_VOTE_LIMITS,
  type DotVoteKind,
  type TimerState,
} from "@/contracts/room-protocol";
import { DotVotePalette, DotVoteSticker } from "@/features/dot-vote";
import type { Note } from "@/features/notes";
import { getBoardPermissions } from "../logic/board-permissions";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import type { RenderedRemoteCursorPresence } from "../logic/cursor-presence";
import type { Decision, Member } from "../logic/room-reducer";
import type { BoardHelpControls } from "../logic/use-board-help";
import type { RoomBoardInteractions } from "../logic/use-room-board-interactions";
import type { StepGuideState } from "../logic/use-step-guide";
import { LeaveConfirmDialog } from "../molecules/leave-confirm-dialog";
import { PhaseLoopControls } from "../molecules/phase-loop-controls";
import { RoomOutcomeView } from "../molecules/room-outcome-view";
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
  phaseRevision?: number;
  ideaMapSizeLevel?: number;
  ideaMapSizeInitialized?: boolean;
  ideaMapIsDragging?: boolean;
  onIdeaMapResize?: (sizeLevel: number) => void;
  sharing?: SharingState | null;
  onSharingStart?: (durationMs: number) => void;
  onSharingAdvance?: (outcome: "done" | "passed") => void;
  timer: TimerState;
  timerServerOffsetMs: number;
  timerUpdateVersion?: number;
  isHost: boolean;
  decision: Decision | null;
  adoptionFocusNoteId?: string | null;
  // WebSocket 接続の表示用状態。値の生成は room-board（コンテナ）の責務で、
  // ここでは受け取った状態を表示するだけ（このコンポーネントはデータ層に依存しない）。
  connectionStatus: RoomScreenConnectionStatus;
  draggingNoteId: string | null;
  members: Member[];
  currentUserId: string;
  // ホストの userId（メンバー一覧の「ホスト」ラベル表示用）。
  hostUserId: string;
  // 全票を使い切ったメンバーの userId。投票先は含まない。
  completedVoterIds?: ReadonlyArray<string>;
  isNextPhasePending: boolean;
  interactions: RoomBoardInteractions;
  help: BoardHelpControls;
  initialGuideState?: StepGuideState;
  remoteCursors: RenderedRemoteCursorPresence[];
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
  onNoteFontSizeChange?: (noteId: string, fontSize: number) => void;
  onNoteDelete: (noteId: string) => void;
  onNoteBringToFront: (noteId: string) => void;
  onNoteExclude?: (noteId: string) => void;
  onNoteRestore?: (noteId: string) => void;
  onBulkCandidateExclude?: () => void;
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
  onAdoptionFocusChange?: (noteId: string | null) => void;
  onRestartWriting?: () => void;
  onRevote?: () => void;
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
  phaseRevision = 0,
  ideaMapSizeLevel = 0,
  ideaMapSizeInitialized = false,
  ideaMapIsDragging = false,
  onIdeaMapResize = () => undefined,
  sharing = null,
  onSharingStart,
  onSharingAdvance,
  timer,
  timerServerOffsetMs,
  timerUpdateVersion = 0,
  isHost,
  decision,
  adoptionFocusNoteId = null,
  connectionStatus,
  draggingNoteId,
  members,
  currentUserId,
  hostUserId,
  completedVoterIds = [],
  isNextPhasePending,
  interactions,
  help,
  remoteCursors,
  signOutAction,
  hmwDecidedIssue,
  decidedHmw,
  onAddPrivateNote,
  onHmwTemplateSelect,
  onIdeaHintSelect,
  onPrivateNoteContentChange,
  onPrivateNoteDelete,
  onNoteContentChange,
  onNoteFontSizeChange = () => undefined,
  onNoteDelete,
  onNoteExclude = () => undefined,
  onNoteRestore = () => undefined,
  onBulkCandidateExclude = () => undefined,
  onGroupCreate,
  onGroupUpdateName,
  onNoteVote,
  onNoteVoteRemove,
  onNoteVoteStickerRemove,
  onNoteVoteStickerMove,
  pendingVoteOperations,
  voteFeedback,
  onNoteDecide,
  onNoteBringToFront,
  onAdoptionFocusChange: notifyAdoptionFocusChange,
  onRestartWriting = () => undefined,
  onRevote = () => undefined,
  onLeave,
  isLeaving,
  onNextPhase,
  onTimerStart,
  onTimerPause,
  onTimerResume,
  onTimerExtend,
  onTimerStop,
  initialGuideState,
}: RoomBoardViewProps) {
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isAdoptMode, setIsAdoptMode] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [voteTotalingDialogOpen, setVoteTotalingDialogOpen] = useState(false);
  const [outcomeDismissed, setOutcomeDismissed] = useState(false);
  const [voteStickerDrag, setVoteStickerDrag] =
    useState<VoteStickerDrag | null>(null);
  const [isVoteStickerReturnDropTarget, setIsVoteStickerReturnDropTarget] =
    useState(false);
  const voteStickerDragRef = useRef<VoteStickerDrag | null>(null);
  const sharedAdoptionFocusRef = useRef<string | null>(null);
  const [selectedVoteKind, setSelectedVoteKind] = useState<DotVoteKind | null>(
    null,
  );
  const [voteStampPointer, setVoteStampPointer] =
    useState<VoteStampPointer | null>(null);
  const suppressPaletteSelectRef = useRef(false);
  const previousPhaseKey = useRef(phaseKey);
  const previousRevision = useRef(phaseRevision);
  const resultShownFor = useRef<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const permissions = getBoardPermissions(phase, decision !== null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (previousPhaseKey.current === phaseKey) return;
    previousPhaseKey.current = phaseKey;
    setIsAdoptMode(false);
  }, [phaseKey]);

  useEffect(() => {
    if (previousRevision.current === phaseRevision) return;
    previousRevision.current = phaseRevision;
    setIsAdoptMode(false);
  }, [phaseRevision]);

  useEffect(() => {
    if (connectionStatus === "open" && isHost && decision === null) return;
    setIsAdoptMode(false);
  }, [connectionStatus, decision, isHost]);

  useEffect(() => {
    if (isAdoptMode || sharedAdoptionFocusRef.current === null) return;
    sharedAdoptionFocusRef.current = null;
    notifyAdoptionFocusChange?.(null);
  }, [isAdoptMode, notifyAdoptionFocusChange]);

  useEffect(
    () => () => {
      if (sharedAdoptionFocusRef.current !== null) {
        notifyAdoptionFocusChange?.(null);
      }
    },
    [notifyAdoptionFocusChange],
  );

  useEffect(() => {
    if (!isAdoptMode) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsAdoptMode(false);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isAdoptMode]);

  useEffect(() => {
    if (isPhaseStep(phase, 3, 5) && decision?.phase === 3) {
      setVoteTotalingDialogOpen(false);
      return;
    }
    const resultKey = `${phaseKey}:${phaseRevision}`;
    if (resultShownFor.current === resultKey) return;
    resultShownFor.current = resultKey;
    setVoteTotalingDialogOpen(
      isResultStep(phase) &&
        !(isPhaseStep(phase, 3, 5) && decision?.phase === 3),
    );
  }, [phase, phaseKey, phaseRevision, decision]);

  useEffect(() => {
    if (isVotingStep(phase)) return;
    voteStickerDragRef.current = null;
    setVoteStickerDrag(null);
    setIsVoteStickerReturnDropTarget(false);
    setSelectedVoteKind(null);
    setVoteStampPointer(null);
  }, [phase]);

  // ハイドレーション直後の高速接続確立によるMismatchedを防ぐため、マウント完了までは接続中（非活性）扱いにする
  const isDisconnected = isMounted ? connectionStatus !== "open" : true;
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
  const candidateNotes = notes.filter(
    (note) => note.visibility === "shared" && !note.excluded,
  );
  const bulkExclusionTargetCount = notes.filter(
    (note) =>
      note.visibility === "shared" &&
      !note.excluded &&
      note.id !== decision?.noteId &&
      note.dotVotes.subjective.count === 0 &&
      note.dotVotes.objective.count === 0,
  ).length;
  const isNextPhaseBlocked =
    (isResultStep(phase) &&
      (decision === null || candidateNotes.length === 0)) ||
    (phase.kind === "step" &&
      phase.step > 1 &&
      !isResultStep(phase) &&
      candidateNotes.length === 0);
  const isSprintComplete = isPhaseStep(phase, 3, 5) && decision?.phase === 3;
  const outcomeIdea =
    decision?.phase === 3
      ? (notes.find((note) => note.id === decision.noteId)?.content ?? null)
      : null;
  const outcome =
    hmwDecidedIssue !== null && decidedHmw !== null && outcomeIdea !== null
      ? { issue: hmwDecidedIssue, hmw: decidedHmw, idea: outcomeIdea }
      : null;
  const decisionContent =
    decision === null
      ? null
      : (notes.find((note) => note.id === decision.noteId)?.content ??
        "確定した内容");

  function handleAdoptNote(noteId: string) {
    if (!isAdoptMode) return;
    handleAdoptionFocusChange(null);
    setIsAdoptMode(false);
    onNoteDecide(noteId);
  }

  function handleAdoptionFocusChange(noteId: string | null): void {
    if (sharedAdoptionFocusRef.current === noteId) return;
    sharedAdoptionFocusRef.current = noteId;
    notifyAdoptionFocusChange?.(noteId);
  }

  function noteElementAt(clientX: number, clientY: number): HTMLElement | null {
    const target = document.elementFromPoint(clientX, clientY);
    const note = target?.closest<HTMLElement>("[data-note-id]") ?? null;
    if (
      !note ||
      !renderedNotes.some(
        ({ id, excluded }) => id === note.dataset.noteId && !excluded,
      )
    ) {
      return null;
    }
    return note;
  }

  function votePaletteElementAt(
    clientX: number,
    clientY: number,
  ): HTMLElement | null {
    return (
      document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>("[data-vote-palette]") ?? null
    );
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
      setIsVoteStickerReturnDropTarget(
        current.stickerId !== null &&
          didDrag &&
          !isDisconnected &&
          isVotingStep(phase) &&
          votePaletteElementAt(event.clientX, event.clientY) !== null,
      );
      if (!current.didDrag && didDrag && current.stickerId === null) {
        setSelectedVoteKind(null);
        setVoteStampPointer(null);
      }
      voteStickerDragRef.current = next;
      setVoteStickerDrag(next);
      return;
    }
    handlePointerMove(event);
    if (isNoteDragging) {
      handlePresencePointerMove(event);
    }
  }

  function handleRootPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const current = voteStickerDragRef.current;
    if (current?.pointerId === event.pointerId) {
      if (current.didDrag && !isDisconnected && isVotingStep(phase)) {
        event.preventDefault();
        const stickerId = current.stickerId;
        const isReturnDrop =
          stickerId !== null &&
          votePaletteElementAt(event.clientX, event.clientY) !== null;
        if (isReturnDrop) {
          onNoteVoteStickerRemove(stickerId);
        } else {
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
      }
      if (current.didDrag && current.stickerId === null) {
        suppressPaletteSelectRef.current = true;
        globalThis.setTimeout(() => {
          suppressPaletteSelectRef.current = false;
        }, 0);
      }
      voteStickerDragRef.current = null;
      setVoteStickerDrag(null);
      setIsVoteStickerReturnDropTarget(false);
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
    if (
      !note ||
      !noteId ||
      !renderedNotes.some(({ id, excluded }) => id === noteId && !excluded)
    ) {
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
      setIsVoteStickerReturnDropTarget(false);
      return;
    }
    if (isNoteDragging) {
      handlePresencePointerLeave(event);
    }
    handlePointerCancel(event);
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
    onPointerCancel: handlePointerCancel,
    onPresencePointerMove: handlePresencePointerMove,
    onPresencePointerLeave: handlePresencePointerLeave,
    onNoteDragStart: handleSharedNoteDragStart,
    onPrivateNoteDragStart: handlePrivateDragStart,
  } = interactions;
  const handleNoteSelect = (noteId: string | null) => {
    setSelectedNoteId(noteId);
    const isSharedNote =
      noteId !== null && renderedNotes.some(({ id }) => id === noteId);
    if (
      noteId !== null &&
      isSharedNote &&
      permissions.canMoveNote &&
      !isDisconnected
    ) {
      onNoteBringToFront(noteId);
    }
  };

  if (isSprintComplete && !outcomeDismissed) {
    return (
      <RoomOutcomeView
        outcome={outcome}
        connected={!isDisconnected}
        onBackToBoard={() => setOutcomeDismissed(true)}
      />
    );
  }

  return (
    <div
      ref={boardRootRef}
      data-testid="room-board-view-root"
      data-connection-status={connectionStatus}
      className={`group/board relative flex h-full min-h-0 flex-col overflow-hidden ${
        isNoteDragging
          ? "cursor-grabbing"
          : isAdoptMode
            ? "cursor-crosshair"
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
        phaseRevision={phaseRevision}
        bulkExclusionTargetCount={bulkExclusionTargetCount}
        canManageCandidates={isResultStep(phase) && decision === null}
        onBulkCandidateExclude={onBulkCandidateExclude}
        sharing={sharing}
        onSharingStart={onSharingStart}
        onSharingAdvance={onSharingAdvance}
        timer={timer}
        timerServerOffsetMs={timerServerOffsetMs}
        timerUpdateVersion={timerUpdateVersion}
        isHost={isHost}
        isDisconnected={isDisconnected}
        connectionStatus={connectionStatus}
        members={members}
        currentUserId={currentUserId}
        hostUserId={hostUserId}
        completedVoterIds={completedVoterIds}
        isNextPhasePending={isNextPhasePending}
        isNextPhaseBlocked={isNextPhaseBlocked}
        initialGuideState={initialGuideState}
        isSprintComplete={isSprintComplete}
        onShowOutcome={() => setOutcomeDismissed(false)}
        signOutAction={signOutAction}
        isLeaving={isLeaving}
        onShowVoteResult={() => setVoteTotalingDialogOpen(true)}
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
        adoptionFocusNoteId={adoptionFocusNoteId}
        isHost={isHost}
        privateNotes={toolbarNotes}
        selectedNoteId={selectedNoteId}
        draggingNoteId={draggingNoteId}
        isDisconnected={isDisconnected}
        ideaMapSizeLevel={ideaMapSizeLevel}
        ideaMapSizeInitialized={ideaMapSizeInitialized}
        ideaMapIsDragging={ideaMapIsDragging || isNoteDragging}
        onIdeaMapResize={onIdeaMapResize}
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
        onSelect={handleNoteSelect}
        onNoteDragStart={handleSharedNoteDragStart}
        onNoteContentChange={onNoteContentChange}
        onNoteFontSizeChange={onNoteFontSizeChange}
        onNoteDelete={onNoteDelete}
        onNoteExclude={onNoteExclude}
        onNoteRestore={onNoteRestore}
        onNoteVote={onNoteVote}
        onNoteVoteRemove={onNoteVoteRemove}
        onNoteVoteStickerRemove={onNoteVoteStickerRemove}
        onNoteVoteStickerDragStart={handleVoteStickerDragStart}
        isAdoptMode={isAdoptMode}
        onAdoptionFocusChange={handleAdoptionFocusChange}
        onAdoptNote={handleAdoptNote}
        onGroupCreate={onGroupCreate}
        onGroupUpdateName={onGroupUpdateName}
        onAddPrivateNote={onAddPrivateNote}
        onPrivateNoteContentChange={onPrivateNoteContentChange}
        onPrivateNoteDelete={onPrivateNoteDelete}
        onPrivateNoteDragStart={handlePrivateDragStart}
        remoteCursors={remoteCursors}
      />

      {isVotingStep(phase) ? (
        <div
          className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-end lg:justify-center"
          data-testid="vote-palette-hud"
        >
          <DotVotePalette
            voteRemaining={voteRemaining}
            pendingOperationCount={pendingVoteOperations.length}
            feedback={voteFeedback}
            disabled={isDisconnected}
            selectedKind={selectedVoteKind}
            isReturnDropTarget={isVoteStickerReturnDropTarget}
            onStickerSelect={handlePaletteStickerSelect}
            onStickerDragStart={handlePaletteStickerDragStart}
          />
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-center"
        data-testid="phase-loop-hud"
      >
        <PhaseLoopControls
          key={`${phaseKey}:${phaseRevision}:${connectionStatus}`}
          phase={phase}
          isHost={isHost}
          isSelecting={isAdoptMode}
          decisionContent={decisionContent}
          candidateCount={candidateNotes.length}
          disabled={isDisconnected || isNextPhasePending}
          onRestartWriting={onRestartWriting}
          onRevote={onRevote}
          onStartSelection={() => {
            setSelectedNoteId(null);
            setIsAdoptMode(true);
          }}
          onCancelSelection={() => setIsAdoptMode(false)}
        />
      </div>

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

      {/* 採用操作の入口は画面下に一本化し、集計ダイアログでは結果の確認だけを行う。 */}
      <VoteTotalingDialog
        open={voteTotalingDialogOpen}
        onOpenChange={setVoteTotalingDialogOpen}
        isVotingComplete={isResultStep(phase)}
        members={members}
        notes={notes}
        decision={decision}
        isHost={false}
        isDisconnected={isDisconnected}
        onNoteDecide={onNoteDecide}
      />

      <LeaveConfirmDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onConfirm={onLeave}
        isLeaving={isLeaving}
        mode={isHost ? "disband" : "leave"}
        completed={isSprintComplete}
        onReturnToOutcome={() => setOutcomeDismissed(false)}
      />
    </div>
  );
}
