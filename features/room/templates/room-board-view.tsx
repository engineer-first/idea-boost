"use client";

// ルームボードの表示用コンポーネント。データ層には一切依存せず、
// 付箋の配列と各種コールバックをpropsで受け取る。
// WebSocket接続・スロットル・プロトコル送信はroom-board.tsx（コンテナ）の責務。
// 「どの付箋を選択中か」「どのダイアログが開いているか」は同期不要な
// 純粋にUIの関心事なので、ここでローカルに持つ。
// 描画の実体はヘッダー（room-board-header）とボード面（room-board-canvas）が
// 持ち、この view は UI 状態と表示用 props・コールバックの配線に徹する。
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { DRAG_THRESHOLD_PX } from "@/contracts/board";
import type { LeaveOutcomeAccess } from "@/contracts/completed-rooms";
import type { PersistentGroup } from "@/contracts/grouping";
import {
  isPhaseStep,
  isResultStep,
  isVotingStep,
  type RoomPhase,
} from "@/contracts/phase";
import type { Carryover, SharingState } from "@/contracts/room-protocol";
import {
  DOT_VOTE_LIMITS,
  type DotVoteKind,
  type TimerState,
} from "@/contracts/room-protocol";
import { canPublishNoteInTurn } from "@/contracts/sharing";
import { DotVotePalette, DotVoteSticker } from "@/features/dot-vote";
import {
  type FeedbackControls,
  FeedbackPanel,
  FeedbackPrompt,
} from "@/features/feedback";
import type { Note } from "@/features/notes";
import { getBoardPermissions } from "../logic/board-permissions";
import type { CanvasFitInsets } from "../logic/canvas-camera";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import type { RenderedRemoteCursorPresence } from "../logic/cursor-presence";
import { roomNotify } from "../logic/room-notify";
import type { Decision, Member } from "../logic/room-reducer";
import type { BoardHelpControls } from "../logic/use-board-help";
import {
  type CanvasSelectionOptions,
  type CanvasTool,
  useCanvasSelection,
} from "../logic/use-canvas-selection";
import type { MemberRemovalControls } from "../logic/use-member-removal";
import type { RoomBoardInteractions } from "../logic/use-room-board-interactions";
import type { RoomDisplayNameControls } from "../logic/use-room-display-name";
import type { StepGuideState } from "../logic/use-step-guide";
import { HostTransferDialog } from "../molecules/host-transfer-dialog";
import { LeaveConfirmDialog } from "../molecules/leave-confirm-dialog";
import { MemberRemoveDialog } from "../molecules/member-remove-dialog";
import type { MoveHistoryControlsProps } from "../molecules/move-history-controls";
import { PhaseLoopControls } from "../molecules/phase-loop-controls";
import { RoomDisplayNameDialog } from "../molecules/room-display-name-dialog";
import { RoomOutcomeView } from "../molecules/room-outcome-view";
import { BoardHelpPanel } from "../organisms/board-help-panel";
import { RoomBoardCanvas } from "../organisms/room-board-canvas";
import { RoomBoardHeader } from "../organisms/room-board-header";

// 透過wrapper全体ではなく実際にpointerを受ける表示領域だけを計測する。
// viewport/mapの物理寸法は変えず、本人fit時の利用可能領域にだけ使う。
export function getBoardFitInsets(viewport: HTMLDivElement): CanvasFitInsets {
  const root = viewport.closest('[data-testid="room-board-view-root"]');
  const area = viewport.getBoundingClientRect();
  let top = 0;
  let bottom = 0;
  for (const group of root?.querySelectorAll<HTMLElement>(
    "[data-board-fit-edge]",
  ) ?? []) {
    for (const element of [
      group,
      ...group.querySelectorAll<HTMLElement>("*"),
    ]) {
      if (
        !(element instanceof HTMLElement) ||
        getComputedStyle(element).pointerEvents === "none"
      )
        continue;
      // 最外の対話領域が占有を代表する。スクロール内容の自然rectを足さない。
      let parent = element.parentElement;
      let nested = false;
      while (parent && group.contains(parent)) {
        if (getComputedStyle(parent).pointerEvents !== "none") {
          nested = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (nested) continue;
      const box = element.getBoundingClientRect();
      let left = Math.max(area.left, box.left);
      let right = Math.min(area.right, box.right);
      let visibleTop = Math.max(area.top, box.top);
      let visibleBottom = Math.min(area.bottom, box.bottom);
      for (
        let clip = element.parentElement;
        clip && clip !== root;
        clip = clip.parentElement
      ) {
        const style = getComputedStyle(clip);
        const rect = clip.getBoundingClientRect();
        if (/hidden|clip|auto|scroll/.test(style.overflowX || style.overflow)) {
          left = Math.max(left, rect.left);
          right = Math.min(right, rect.right);
        }
        if (/hidden|clip|auto|scroll/.test(style.overflowY || style.overflow)) {
          visibleTop = Math.max(visibleTop, rect.top);
          visibleBottom = Math.min(visibleBottom, rect.bottom);
        }
      }
      if (right <= left || visibleBottom <= visibleTop) continue;
      if (group.dataset.boardFitEdge === "top")
        top = Math.max(top, visibleBottom - area.top);
      else bottom = Math.max(bottom, area.bottom - visibleTop);
    }
  }
  for (const toast of document.querySelectorAll<HTMLElement>(
    '[data-sonner-toast][data-visible="true"][data-removed="false"][data-y-position="bottom"]',
  )) {
    const box = toast.getBoundingClientRect();
    if (
      box.width > 0 &&
      box.height > 0 &&
      box.right > area.left &&
      box.left < area.right &&
      box.top < area.bottom &&
      box.bottom > area.top
    )
      bottom = Math.max(bottom, area.bottom - box.top);
  }
  return { top, right: 0, bottom, left: 0 };
}

export type RoomBoardViewProps = {
  feedback?: FeedbackControls;
  moveHistory?: MoveHistoryControlsProps;
  notes: Note[];
  confirmedNotes?: Note[];
  pendingCandidateNoteIds?: string[];
  isCandidatePending?: boolean;
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
  hostRevision?: number;
  onTransferHost?: (targetUserId: string) => void;
  isTransferring?: boolean;
  transferError?: string | null;
  memberRemoval?: MemberRemovalControls;
  displayName?: RoomDisplayNameControls;
  decision: Decision | null;
  outcomePublished: boolean;
  adoptionFocusNoteId?: string | null;
  // WebSocket 接続の表示用状態。値の生成は room-board（コンテナ）の責務で、
  // ここでは受け取った状態を表示するだけ（このコンポーネントはデータ層に依存しない）。
  connectionStatus: RoomScreenConnectionStatus;
  connectionDelayed?: boolean;
  draggingNoteId: string | null;
  members: Member[];
  authorNames?: ReadonlyMap<string, string>;
  loginReturnHref?: string;
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
  issueReference?: Carryover | null;
  hmwReference?: Carryover | null;
  onAddPrivateNote: () => string | null;
  noteCreationPending?: boolean;
  noteCreationReceipt?: { operationId: string; noteId: string };
  noteCreationSupported?: boolean;
  // Step 2-1 でテンプレート・具体例を起点に付箋を作る。
  onHmwTemplateSelect: (content: string) => void;
  onIdeaHintSelect: (content: string) => void;
  onPrivateNoteContentChange: (noteId: string, content: string) => void;
  onPrivateNoteDelete: (noteId: string) => void;
  onNoteContentChange: (noteId: string, content: string) => void;
  draftValue?: (noteId: string) => string | undefined;
  onDraftChange?: (noteId: string, content: string) => void;
  onDraftCompositionStart?: (noteId: string) => void;
  onDraftCompositionEnd?: (noteId: string, content: string) => void;
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
  onDecisionClear?: () => void;
  onPublishOutcome: () => void;
  onAdoptionFocusChange?: (noteId: string | null) => void;
  onRestartWriting?: () => void;
  onRevote?: () => void;
  // 退出。
  onLeave: (outcomeAccess?: LeaveOutcomeAccess) => void;
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
  owner?: HTMLButtonElement;
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
  feedback,
  moveHistory,
  notes,
  confirmedNotes = notes,
  pendingCandidateNoteIds = [],
  isCandidatePending = false,
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
  hostRevision = 0,
  onTransferHost,
  isTransferring: transferringHost = false,
  transferError = null,
  memberRemoval,
  displayName,
  decision,
  outcomePublished,
  adoptionFocusNoteId = null,
  connectionStatus,
  connectionDelayed = false,
  draggingNoteId,
  members,
  authorNames,
  loginReturnHref,
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
  issueReference,
  hmwReference,
  onAddPrivateNote,
  noteCreationPending = false,
  noteCreationReceipt,
  noteCreationSupported = true,
  onHmwTemplateSelect,
  onIdeaHintSelect,
  onPrivateNoteContentChange,
  onPrivateNoteDelete,
  onNoteContentChange,
  draftValue,
  onDraftChange,
  onDraftCompositionStart,
  onDraftCompositionEnd,
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
  onDecisionClear,
  onPublishOutcome,
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
  const isTransferring = transferringHost || (memberRemoval?.pending ?? false);
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const shouldExpandPrivateNotes =
    phase.kind === "step" && phase.step === 1 && phase.phase <= 3;
  const selection = useCanvasSelection({
    viewportRef: interactions.boardScrollerRef,
    notes: [...notes, ...interactions.privateNotes],
  });
  const selectedNoteIds = selection.selectedNoteIds;
  const selectedNoteId =
    selectedNoteIds.length === 1 ? selectedNoteIds[0] : null;
  const setSelectedNoteId = selection.selectNote;
  const [interactionTool, setInteractionTool] = useState<CanvasTool>("select");
  const [rootPointerPressed, setRootPointerPressed] = useState(false);
  const rootPressRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    didDrag: boolean;
    canvas: boolean;
    owner: HTMLElement;
  } | null>(null);
  const cancelledRootPointerRef = useRef<number | null>(null);
  const rejectedVotePointersRef = useRef(new Set<number>());
  const rejectedVoteClickOwnersRef = useRef(new Set<HTMLElement>());
  const suppressCanvasClickRef = useRef(false);
  const cancelRootPress = useCallback((): boolean => {
    const press = rootPressRef.current;
    if (!press) return false;
    rootPressRef.current = null;
    cancelledRootPointerRef.current = press.pointerId;
    setRootPointerPressed(false);
    suppressCanvasClickRef.current = true;
    if (press.owner.hasPointerCapture?.(press.pointerId))
      press.owner.releasePointerCapture(press.pointerId);
    return true;
  }, []);
  const [isAdoptRequested, setIsAdoptMode] = useState(false);
  const [adoptHostRevision, setAdoptHostRevision] = useState(hostRevision);
  const isAdoptMode = isAdoptRequested && adoptHostRevision === hostRevision;
  const [expandPrivateNotesRequest, setExpandPrivateNotesRequest] = useState(0);
  const privateNoteAddRef = useRef<(() => void) | null>(null);
  const composingRef = useRef(false);
  const [leaveDialogRevision, setLeaveDialogRevision] = useState<number | null>(
    null,
  );
  const leaveDialogOpen = leaveDialogRevision === hostRevision;
  const setLeaveDialogOpen = (open: boolean) =>
    setLeaveDialogRevision(open ? hostRevision : null);
  const [hostTarget, setHostTarget] = useState<{
    userId: string;
    revision: number;
  } | null>(null);
  const [outcomeDismissed, setOutcomeDismissed] = useState(false);
  const [voteStickerDrag, setVoteStickerDrag] =
    useState<VoteStickerDrag | null>(null);
  const [isVoteStickerReturnDropTarget, setIsVoteStickerReturnDropTarget] =
    useState(false);
  const voteStickerDragRef = useRef<VoteStickerDrag | null>(null);
  const cancelledCanvasKeyClicksRef = useRef(new Set<HTMLElement>());
  const sharedAdoptionFocusRef = useRef<string | null>(null);
  const adoptionHostRevisionRef = useRef(hostRevision);
  const adoptionFocusCallbackRef = useRef(notifyAdoptionFocusChange);
  const [selectedVoteKind, setSelectedVoteKind] = useState<DotVoteKind | null>(
    null,
  );
  const [voteStampPointer, setVoteStampPointer] =
    useState<VoteStampPointer | null>(null);
  const suppressPaletteSelectRef = useRef(false);
  const previousPhaseKey = useRef(phaseKey);
  const previousRevision = useRef(phaseRevision);
  const [isMounted, setIsMounted] = useState(false);
  const permissions = getBoardPermissions(phase, decision !== null);

  const cancelVoteDrag = useCallback((): boolean => {
    const current = voteStickerDragRef.current;
    if (!current) return false;
    voteStickerDragRef.current = null;
    setVoteStickerDrag(null);
    setIsVoteStickerReturnDropTarget(false);
    if (rootPressRef.current?.pointerId === current.pointerId) {
      rootPressRef.current = null;
      setRootPointerPressed(false);
    }
    suppressCanvasClickRef.current = true;
    if (current.stickerId === null) suppressPaletteSelectRef.current = true;
    if (current.owner?.hasPointerCapture?.(current.pointerId))
      current.owner.releasePointerCapture(current.pointerId);
    return true;
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (previousPhaseKey.current === phaseKey) return;
    previousPhaseKey.current = phaseKey;
    setIsAdoptMode(false);
    cancelRootPress();
    selection.cancel();
    interactions.cancelCurrentNoteDrag(true);
    interactions.cancelPan?.();
    cancelVoteDrag();
    setSelectedNoteId(null);
    if (shouldExpandPrivateNotes)
      setExpandPrivateNotesRequest((request) => request + 1);
  }, [
    phaseKey,
    cancelRootPress,
    shouldExpandPrivateNotes,
    selection.cancel,
    interactions.cancelCurrentNoteDrag,
    interactions.cancelPan,
    cancelVoteDrag,
    setSelectedNoteId,
  ]);

  useEffect(() => {
    if (previousRevision.current === phaseRevision) return;
    previousRevision.current = phaseRevision;
    setIsAdoptMode(false);
    cancelRootPress();
    selection.cancel();
    interactions.cancelCurrentNoteDrag(true);
    interactions.cancelPan?.();
    cancelVoteDrag();
    setSelectedNoteId(null);
  }, [
    phaseRevision,
    cancelRootPress,
    selection.cancel,
    interactions.cancelCurrentNoteDrag,
    interactions.cancelPan,
    cancelVoteDrag,
    setSelectedNoteId,
  ]);

  useEffect(() => {
    if (connectionStatus === "open" && isHost && decision === null) return;
    setIsAdoptMode(false);
  }, [connectionStatus, decision, isHost]);

  useEffect(() => {
    if (connectionStatus !== "open") {
      selection.cancel();
      interactions.cancelCurrentNoteDrag(true);
      interactions.cancelPan?.();
      cancelVoteDrag();
      cancelRootPress();
      setSelectedNoteId(null);
    } else if (isAdoptMode) setSelectedNoteId(null);
  }, [
    connectionStatus,
    isAdoptMode,
    cancelRootPress,
    selection.cancel,
    interactions.cancelCurrentNoteDrag,
    interactions.cancelPan,
    cancelVoteDrag,
    setSelectedNoteId,
  ]);

  useEffect(() => {
    adoptionFocusCallbackRef.current = notifyAdoptionFocusChange;
    if (adoptionHostRevisionRef.current !== hostRevision) {
      adoptionHostRevisionRef.current = hostRevision;
      // 移譲時はRoomDOが共有フォーカスを消す。旧ホスト権限で解除を送り直さない。
      sharedAdoptionFocusRef.current = null;
      return;
    }
    if (isAdoptMode || sharedAdoptionFocusRef.current === null) return;
    sharedAdoptionFocusRef.current = null;
    notifyAdoptionFocusChange?.(null);
  }, [hostRevision, isAdoptMode, notifyAdoptionFocusChange]);

  useEffect(
    () => () => {
      if (sharedAdoptionFocusRef.current !== null) {
        adoptionFocusCallbackRef.current?.(null);
      }
    },
    [],
  );

  useEffect(() => {
    interactions.onToolChange?.(interactionTool);
    interactions.onGestureBlockedChange?.(
      selection.hasGesture() ||
        interactions.isNoteDragging ||
        voteStickerDrag !== null ||
        rootPointerPressed,
    );
  });

  function changeTool(tool: CanvasTool): void {
    if (
      rootPressRef.current !== null ||
      selection.hasGesture() ||
      interactions.hasPan?.() ||
      interactions.isNoteDragging ||
      voteStickerDragRef.current ||
      interactions.boardScrollerRef.current?.querySelector(
        "[data-editing='true']",
      ) ||
      document.querySelector("[role='dialog'], [role='menu']")
    )
      return;
    setInteractionTool(tool);
    interactions.onToolChange?.(tool);
  }

  useEffect(() => {
    // private placeholderでsurfaceが外れてbodyへfocusが移る場合も、
    // 所有中gestureの取消をtoolbarの選択解除より先に1段だけ扱う。
    function cancelOwnedGesture(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.isComposing || event.keyCode === 229)
        return;
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']",
        )
      )
        return;
      const root = interactions.boardRootRef.current;
      if (target !== document.body && !root?.contains(target)) return;
      if (target.closest("details[open]")) return;
      if (event.defaultPrevented) {
        if (rootPressRef.current?.owner === target) cancelRootPress();
        return;
      }
      if (selection.cancel()) {
        // 開始前の選択を復元する。
      } else if (interactions.isNoteDragging) {
        interactions.cancelCurrentNoteDrag(true);
      } else if (interactions.hasPan?.()) {
        interactions.cancelPan?.();
      } else if (!cancelVoteDrag() && !cancelRootPress()) return;
      cancelRootPress();
      suppressCanvasClickRef.current = true;
      event.preventDefault();
      event.stopPropagation();
      if (!interactions.boardRootRef.current?.contains(target))
        interactions.boardScrollerRef.current?.focus({ preventScroll: true });
    }
    function handleKey(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229)
        return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']",
        )
      )
        return;
      const root = interactions.boardRootRef.current;
      if (!root?.contains(target)) return;
      if (event.key === "Escape") {
        if (selectedVoteKind !== null) {
          setSelectedVoteKind(null);
          setVoteStampPointer(null);
          event.preventDefault();
          return;
        }
        if (isAdoptMode) {
          setIsAdoptMode(false);
          event.preventDefault();
          return;
        }
        if (rootPressRef.current) {
          cancelRootPress();
          suppressCanvasClickRef.current = true;
          event.preventDefault();
          return;
        }
        if (selection.selectionRef.current.length > 0) {
          selection.selectNote(null);
          event.preventDefault();
          return;
        }
        if (interactionTool === "hand") {
          changeTool("select");
          event.preventDefault();
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const viewport = interactions.boardScrollerRef.current;
      if (target !== viewport && target.dataset.canvasBackground !== "true")
        return;
      if (event.key.toLowerCase() === "h" || event.key.toLowerCase() === "v") {
        changeTool(event.key.toLowerCase() === "h" ? "hand" : "select");
        event.preventDefault();
      }
    }
    function blur(): void {
      selection.cancel();
      interactions.cancelCurrentNoteDrag(true);
      cancelVoteDrag();
      cancelRootPress();
    }
    window.addEventListener("keydown", cancelOwnedGesture, true);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", cancelOwnedGesture, true);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("blur", blur);
    };
  });

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
  const candidateNotes = confirmedNotes.filter(
    (note) => note.visibility === "shared" && !note.excluded,
  );
  const bulkExclusionTargetCount = confirmedNotes.filter(
    (note) =>
      note.visibility === "shared" &&
      !note.excluded &&
      note.id !== decision?.noteId &&
      note.dotVotes.subjective.count === 0 &&
      note.dotVotes.objective.count === 0,
  ).length;
  const isNextPhaseBlocked =
    isCandidatePending ||
    (isResultStep(phase) &&
      (decision === null || candidateNotes.length === 0)) ||
    (phase.kind === "step" &&
      phase.step > 1 &&
      !isResultStep(phase) &&
      candidateNotes.length === 0);
  const hasFinalDecision = isPhaseStep(phase, 3, 5) && decision?.phase === 3;
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

  function hasActiveCanvasGesture(): boolean {
    return Boolean(
      rootPressRef.current?.didDrag ||
        voteStickerDragRef.current?.didDrag ||
        selection.hasGesture() ||
        interactions.isNoteDragging ||
        interactions.isPanning ||
        interactions.hasPan?.(),
    );
  }

  function handleAdoptNote(noteId: string) {
    if (
      !isAdoptMode ||
      hasActiveCanvasGesture() ||
      isCandidatePending ||
      !confirmedNotes.some((note) => note.id === noteId && !note.excluded)
    )
      return;
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
    if (!note || !renderedNotes.some(({ id }) => id === note.dataset.noteId)) {
      return null;
    }
    return note;
  }

  function isExcludedVoteTarget(note: HTMLElement): boolean {
    return confirmedNotes.some(
      ({ id, excluded }) => id === note.dataset.noteId && excluded,
    );
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

  function votePointerConflicts(
    pointerId: number,
    owner: HTMLElement,
  ): boolean {
    const press = rootPressRef.current;
    const vote = voteStickerDragRef.current;
    return !!(
      (press && (press.pointerId !== pointerId || press.owner !== owner)) ||
      (vote && (vote.pointerId !== pointerId || vote.owner !== owner)) ||
      interactions.isNoteDragging ||
      selection.hasGesture() ||
      interactions.hasPan?.()
    );
  }

  function rejectVotePointer(pointerId: number, owner: HTMLElement): void {
    rejectedVotePointersRef.current.add(pointerId);
    rejectedVoteClickOwnersRef.current.add(owner);
    // touchの暗黙captureも、棄却したgestureの所有として残さない。
    if (owner.hasPointerCapture?.(pointerId))
      owner.releasePointerCapture(pointerId);
  }

  function handlePaletteStickerDragStart(
    kind: DotVoteKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (votePointerConflicts(event.pointerId, event.currentTarget)) {
      rejectVotePointer(event.pointerId, event.currentTarget);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      isDisconnected ||
      !isVotingStep(phase) ||
      voteRemaining[kind] <= 0 ||
      voteStickerDragRef.current ||
      interactions.isNoteDragging ||
      selection.hasGesture() ||
      interactions.hasPan?.()
    ) {
      return;
    }
    suppressPaletteSelectRef.current = false;
    suppressCanvasClickRef.current = false;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next: VoteStickerDrag = {
      owner: event.currentTarget,
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
    if (votePointerConflicts(event.pointerId, event.currentTarget)) {
      rejectVotePointer(event.pointerId, event.currentTarget);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      isDisconnected ||
      !isVotingStep(phase) ||
      interactionTool === "hand" ||
      voteStickerDragRef.current ||
      interactions.isNoteDragging ||
      selection.hasGesture() ||
      interactions.hasPan?.()
    ) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next: VoteStickerDrag = {
      owner: event.currentTarget,
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
    const pressed = rootPressRef.current;
    if (event.buttons === 0 && pressed?.pointerId === event.pointerId) {
      cancelRootPress();
      if (isNoteDragging) interactions.cancelCurrentNoteDrag(true);
    }
    if (
      event.buttons === 0 &&
      voteStickerDragRef.current?.pointerId === event.pointerId
    ) {
      cancelVoteDrag();
      return;
    }
    if (
      pressed?.pointerId === event.pointerId &&
      Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >=
        DRAG_THRESHOLD_PX
    ) {
      pressed.didDrag = true;
      suppressCanvasClickRef.current = true;
    }
    if (selection.hasGesture() || interactions.hasPan?.()) return;
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
    if (current) return;
    handlePointerMove(event);
    if (isNoteDragging) {
      handlePresencePointerMove(event);
    }
  }

  function handleRootPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const current = voteStickerDragRef.current;
    if (current?.pointerId === event.pointerId) {
      voteStickerDragRef.current = null;
      setVoteStickerDrag(null);
      setIsVoteStickerReturnDropTarget(false);
      if (current.owner?.hasPointerCapture?.(event.pointerId))
        current.owner.releasePointerCapture(event.pointerId);
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
          if (note && isExcludedVoteTarget(note)) {
            roomNotify.cannotVoteExcludedNote();
          } else if (note) {
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
    if (rootPressRef.current) return;
    if (suppressPaletteSelectRef.current && event.detail !== 0) return;
    // detail=0はEnter/Spaceによるnative activation。取消済みpointerとは分ける。
    if (event.detail === 0) suppressPaletteSelectRef.current = false;
    if (
      isDisconnected ||
      !isVotingStep(phase) ||
      voteRemaining[kind] <= 0 ||
      voteStickerDragRef.current ||
      interactions.isNoteDragging ||
      selection.hasGesture() ||
      interactions.hasPan?.()
    ) {
      return;
    }
    const nextKind = selectedVoteKind === kind ? null : kind;
    if (nextKind !== null) selection.selectNote(null);
    setSelectedVoteKind(nextKind);
    setVoteStampPointer(
      nextKind === null
        ? null
        : { clientX: event.clientX, clientY: event.clientY },
    );
  }

  function handleRootClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    const element = event.target instanceof Element ? event.target : null;
    const targetElement =
      element?.closest<HTMLElement>("button") ??
      (element instanceof HTMLElement ? element : null);
    const voteButton = targetElement?.closest(
      "[data-vote-palette], [data-vote-sticker-id]",
    );
    const pointerId =
      "pointerId" in event.nativeEvent &&
      typeof event.nativeEvent.pointerId === "number"
        ? event.nativeEvent.pointerId
        : null;
    const rejectedPointerClick =
      event.detail !== 0 &&
      ((pointerId !== null && rejectedVotePointersRef.current.has(pointerId)) ||
        (targetElement &&
          rejectedVoteClickOwnersRef.current.has(targetElement)));
    const competingVoteClick =
      voteButton &&
      (rootPressRef.current ||
        voteStickerDragRef.current ||
        interactions.isNoteDragging ||
        selection.hasGesture() ||
        interactions.hasPan?.());
    const competingCanvasClick =
      (targetElement?.dataset.canvasNoteSurface === "true" ||
        targetElement?.dataset.adoptTarget === "true") &&
      hasActiveCanvasGesture();
    const cancelledCanvasKeyClick =
      event.detail === 0 &&
      targetElement &&
      cancelledCanvasKeyClicksRef.current.has(targetElement);
    if (
      rejectedPointerClick ||
      competingVoteClick ||
      competingCanvasClick ||
      cancelledCanvasKeyClick
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const inCanvas =
      targetElement &&
      (boardScrollerRef.current?.contains(targetElement) ||
        privateToolbarRef.current?.contains(targetElement)) &&
      !targetElement.closest(
        "input, textarea, select, [contenteditable='true'], [data-board-native-control]",
      );
    const suppressedPan = interactions.consumePanClick?.() ?? false;
    const nativeCanvasActivation =
      event.detail === 0 &&
      targetElement?.closest("button, summary") &&
      targetElement.dataset.canvasNoteSurface !== "true";
    if (
      inCanvas &&
      ((interactionTool === "hand" && !nativeCanvasActivation) ||
        (event.detail !== 0 &&
          (suppressCanvasClickRef.current || suppressedPan)))
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
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
    if (!note || !noteId || !confirmedNotes.some(({ id }) => id === noteId)) {
      return;
    }
    if (isExcludedVoteTarget(note)) {
      event.preventDefault();
      event.stopPropagation();
      roomNotify.cannotVoteExcludedNote();
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
      cancelVoteDrag();
      return;
    }
    if (isNoteDragging) {
      handlePresencePointerLeave(event);
    }
    handlePointerCancel(event);
  }

  const {
    boardRootRef,
    boardScrollerRef,
    ideaMapPlaneRef,
    privateToolbarRef,
    notes: renderedNotes,
    privateNotes: toolbarNotes,
    dragGhost,
    dragPreview,
    isReturnDropTarget,
    privateDropPlaceholder,
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

  const hasMoveHistory = moveHistory !== undefined;
  // mobileはHUDの実高を使って積む。fit用の占有領域・desktopの配置はそのまま保つ。
  useEffect(() => {
    const root = boardRootRef.current;
    if (!root) return;
    const surfaces = [
      ["board-tools-hud", "--board-tools-height"],
      ["board-operation-matrix", "--board-operation-height"],
      ["phase-loop-hud", "--board-phase-hud-height"],
      ["idea-map-size-controls-hud", "--board-map-hud-height"],
      ["vote-palette-hud", "--board-vote-hud-height"],
      ["private-notes-toolbar", "--board-private-toolbar-height"],
    ] as const;
    const update = () => {
      for (const [testId, property] of surfaces) {
        if (
          testId === "idea-map-size-controls-hud" &&
          (phase.kind !== "step" || phase.phase !== 3)
        ) {
          root.style.setProperty(property, "0px");
          continue;
        }
        const element = root.querySelector<HTMLElement>(
          `[data-testid="${testId}"]`,
        );
        root.style.setProperty(
          property,
          `${element?.getBoundingClientRect().height ?? 0}px`,
        );
      }
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    for (const [testId] of surfaces) {
      const element = root.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      if (element) observer?.observe(element);
    }
    update();
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [boardRootRef, phase]);

  // 通知はボードの外の portal に描画される。実際の占有高だけ HUD に渡し、
  // 通知の寿命・Undo・camera・共有状態は変えない。
  useEffect(() => {
    const root = boardRootRef.current;
    if (!root) return;
    const toasts =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateNotificationInset);
    const observedToasts = new Set<HTMLElement>();
    let previousInset = -1;
    function updateNotificationInset(): void {
      let inset = 0;
      const currentToasts = new Set(
        document.querySelectorAll<HTMLElement>(
          '[data-sonner-toast][data-visible="true"][data-removed="false"][data-y-position="bottom"]',
        ),
      );
      for (const toast of observedToasts) {
        if (currentToasts.has(toast)) continue;
        toasts?.unobserve(toast);
        observedToasts.delete(toast);
      }
      for (const toast of currentToasts) {
        if (!observedToasts.has(toast)) {
          toasts?.observe(toast);
          observedToasts.add(toast);
        }
        const toaster = toast.closest<HTMLElement>("[data-sonner-toaster]");
        if (!toaster) continue;
        const bottom = Number.parseFloat(getComputedStyle(toaster).bottom) || 0;
        const offset =
          Number.parseFloat(toast.style.getPropertyValue("--offset")) || 0;
        inset = Math.max(inset, bottom + offset + toast.offsetHeight + 16);
      }
      if (inset !== previousInset) {
        root?.style.setProperty("--board-notification-inset", `${inset}px`);
        previousInset = inset;
      }
    }
    const mutations = new MutationObserver((records) => {
      if (
        records.some(({ target, type, addedNodes, removedNodes }) => {
          if (
            target instanceof Element &&
            target.closest("[data-sonner-toaster]")
          )
            return true;
          if (type !== "childList") return false;
          // Portalの追加/削除だけを拾う。付箋入力等ではlayout計測しない。
          return [...addedNodes, ...removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches("[data-sonner-toaster]") ||
                node.querySelector("[data-sonner-toaster]")),
          );
        })
      )
        updateNotificationInset();
    });
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-visible", "data-removed", "style"],
    });
    window.addEventListener("resize", updateNotificationInset);
    updateNotificationInset();
    return () => {
      mutations.disconnect();
      toasts?.disconnect();
      window.removeEventListener("resize", updateNotificationInset);
      root.style.removeProperty("--board-notification-inset");
    };
  }, [boardRootRef]);

  const handleNoteSelect = (
    noteId: string | null,
    options: CanvasSelectionOptions = {},
  ) => {
    if (isAdoptMode && interactionTool === "select") return;
    setSelectedNoteId(noteId, options);
    const isSharedNote =
      noteId !== null &&
      confirmedNotes.some(({ id, excluded }) => id === noteId && !excluded);
    if (
      options.bringToFront === true &&
      !options.shiftKey &&
      interactionTool === "select" &&
      noteId !== null &&
      isSharedNote &&
      permissions.canMoveNote &&
      !pendingCandidateNoteIds.includes(noteId) &&
      !isDisconnected
    ) {
      onNoteBringToFront(noteId);
    }
  };

  const feedbackButtonRef = useRef<HTMLButtonElement>(null);
  if (hasFinalDecision && outcomePublished && !outcomeDismissed) {
    return (
      <>
        <RoomOutcomeView
          onOpenFeedback={feedback ? () => feedback.open("app") : undefined}
          feedbackButtonRef={feedbackButtonRef}
          onExportSuccess={feedback?.schedulePrompt}
          onExportFailure={feedback?.cancelPrompt}
          feedbackPrompt={
            feedback ? (
              <FeedbackPrompt
                feedback={feedback}
                returnFocusRef={feedbackButtonRef}
              />
            ) : null
          }
          outcome={outcome}
          connected={!isDisconnected}
        >
          <Button
            variant="outline"
            className="min-h-11"
            disabled={isLeaving}
            onClick={() => setLeaveDialogOpen(true)}
          >
            退出してホームへ
          </Button>
        </RoomOutcomeView>
        <LeaveConfirmDialog
          key={`${hostRevision}:${outcomePublished}`}
          open={leaveDialogOpen && !isTransferring}
          onOpenChange={setLeaveDialogOpen}
          onConfirm={onLeave}
          isLeaving={isLeaving}
          mode="leave"
          completed
          onReturnToOutcome={() => setLeaveDialogOpen(false)}
        />
        {feedback ? <FeedbackPanel feedback={feedback} /> : null}
      </>
    );
  }

  return (
    <>
      <div
        ref={boardRootRef}
        data-testid="room-board-view-root"
        data-connection-status={connectionStatus}
        style={
          {
            // トレイの操作欄を含む総高を、上部パネルの予約にも使う。
            // 接続案内が長いときも、その下の現在地1行と余白を残す。
            "--board-operation-bottom":
              "calc(0.75rem + var(--board-notification-inset, 0px) + var(--board-tools-height, 48px) + 0.5rem)",
            "--board-mobile-controls-bottom":
              "calc(var(--board-operation-bottom) + var(--board-operation-height, 62px) + 0.5rem)",
            "--board-mobile-header-bottom":
              "calc(var(--board-private-dock-bottom) + var(--board-private-toolbar-height, 0px) + 0.75rem)",
            "--board-mobile-phase-bottom":
              "calc(var(--board-mobile-controls-bottom) + var(--board-map-hud-height, 0px) + var(--board-vote-hud-height, 0px) + 0.5rem)",
            "--board-private-dock-bottom":
              "calc(var(--board-mobile-phase-bottom) + var(--board-phase-hud-height, 0px) + 0.5rem)",
            "--board-private-dock-top":
              "max(16.5rem, calc(var(--board-connection-notice-bottom, 0px) + 3.5rem))",
            "--board-private-dock-height": hasMoveHistory
              ? "min(20rem, max(0px, calc(100dvh - var(--board-private-dock-bottom) - var(--board-private-dock-top))))"
              : connectionStatus === "open"
                ? "min(20rem, max(10rem, calc(100dvh - var(--board-private-dock-bottom) - 16.5rem)))"
                : "min(20rem, max(10rem, calc(100dvh - var(--board-private-dock-bottom) - 16.5rem)), max(0px, calc(100dvh - var(--board-private-dock-bottom) - var(--board-private-dock-top))))",
          } as CSSProperties
        }
        className={`group/board relative flex h-full min-h-0 flex-col overflow-hidden ${
          isNoteDragging
            ? "cursor-grabbing"
            : isAdoptMode
              ? "cursor-crosshair"
              : selectedVoteKind !== null
                ? "cursor-crosshair"
                : ""
        }`}
        onPointerDownCapture={(event) => {
          const element = event.target instanceof Element ? event.target : null;
          const target =
            element?.closest<HTMLElement>("button") ??
            (element instanceof HTMLElement ? element : null);
          const voteButton = target?.closest(
            "[data-vote-palette], [data-vote-sticker-id]",
          );
          if (target && voteButton) {
            if (votePointerConflicts(event.pointerId, target)) {
              rejectVotePointer(event.pointerId, target);
              if (
                element !== target &&
                element?.hasPointerCapture?.(event.pointerId)
              )
                element.releasePointerCapture(event.pointerId);
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            rejectedVotePointersRef.current.delete(event.pointerId);
            rejectedVoteClickOwnersRef.current.delete(target);
          }
          if (
            !rootPressRef.current &&
            cancelledRootPointerRef.current === event.pointerId
          )
            cancelledRootPointerRef.current = null;
          const privateSurface =
            target?.dataset.canvasNoteSurface === "true" &&
            !!target.closest("[data-testid='private-notes-toolbar']");
          // 名前入力・本文editor・HUDのnative操作はgesture所有にしない。
          if (
            target?.closest(
              "input, textarea, select, [contenteditable='true'], [data-board-native-control]",
            ) ||
            (target?.closest("button, summary") &&
              !boardScrollerRef.current?.contains(target) &&
              !privateSurface)
          ) {
            rejectedVotePointersRef.current.delete(event.pointerId);
            suppressCanvasClickRef.current = false;
            return;
          }
          if (
            rootPressRef.current ||
            voteStickerDragRef.current ||
            selection.hasGesture() ||
            interactions.hasPan?.() ||
            interactions.isNoteDragging
          ) {
            event.stopPropagation();
            return;
          }
          rejectedVotePointersRef.current.delete(event.pointerId);
          suppressCanvasClickRef.current = false;
          suppressPaletteSelectRef.current = false;
          const canvas =
            event.target instanceof HTMLElement &&
            !!boardScrollerRef.current?.contains(event.target) &&
            !event.target.closest(
              "input, textarea, select, [contenteditable='true'], [data-board-native-control]",
            );
          if (cancelledRootPointerRef.current === event.pointerId)
            cancelledRootPointerRef.current = null;
          setRootPointerPressed(canvas || privateSurface);
          if (!canvas && !privateSurface) {
            rootPressRef.current = null;
            return;
          }
          rootPressRef.current = {
            canvas,
            owner: target ?? event.currentTarget,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            didDrag: false,
          };
        }}
        onPointerMoveCapture={(event) => {
          if (
            cancelledRootPointerRef.current === event.pointerId ||
            rejectedVotePointersRef.current.has(event.pointerId)
          )
            event.stopPropagation();
        }}
        onPointerUpCapture={(event) => {
          if (
            cancelledRootPointerRef.current === event.pointerId ||
            rejectedVotePointersRef.current.has(event.pointerId)
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onLostPointerCaptureCapture={(event) => {
          const drag = voteStickerDragRef.current;
          if (
            drag?.pointerId === event.pointerId &&
            drag.owner === event.target
          )
            cancelVoteDrag();
          const press = rootPressRef.current;
          if (
            press?.pointerId === event.pointerId &&
            press.owner === event.target &&
            !boardScrollerRef.current?.hasPointerCapture?.(event.pointerId)
          )
            cancelRootPress();
        }}
        onClickCapture={handleRootClickCapture}
        onCompositionStartCapture={() => {
          composingRef.current = true;
        }}
        onCompositionEndCapture={() => {
          composingRef.current = false;
        }}
        onKeyDownCapture={(event) => {
          const target = event.target;
          const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
          if (
            event.key === "Enter" &&
            (isMac
              ? event.metaKey && !event.ctrlKey
              : event.ctrlKey && !event.metaKey) &&
            !event.altKey &&
            !event.shiftKey &&
            !event.defaultPrevented &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229 &&
            !composingRef.current &&
            target instanceof HTMLElement
          ) {
            const inPrivateToolbar =
              target.closest('[data-testid="private-notes-toolbar"]') !== null;
            const isPrivateSurface =
              inPrivateToolbar && target.dataset.canvasNoteSurface === "true";
            const isPrivateEditor =
              inPrivateToolbar &&
              target instanceof HTMLTextAreaElement &&
              !target.readOnly;
            const isBackground =
              target === interactions.boardScrollerRef.current ||
              target.dataset.canvasBackground === "true";
            if (
              (isBackground || isPrivateSurface || isPrivateEditor) &&
              !target.closest(
                '[data-board-native-control], [role="menu"], [role="dialog"]',
              )
            ) {
              // 追加できない間も、同じキーでsurfaceのclickや本文の改行を合成しない。
              event.preventDefault();
              event.stopPropagation();
              if (
                !event.repeat &&
                !isDisconnected &&
                shouldExpandPrivateNotes &&
                permissions.canCreateNote &&
                noteCreationSupported &&
                !noteCreationPending &&
                !hasActiveCanvasGesture() &&
                !document.querySelector(
                  '[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open], details[open]',
                )
              )
                privateNoteAddRef.current?.();
              return;
            }
          }
          if (
            moveHistory &&
            target instanceof HTMLElement &&
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            event.key.toLowerCase() === "z" &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229 &&
            !event.repeat &&
            !target.closest(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"], [role="alertdialog"], dialog',
            ) &&
            !document.querySelector(
              '[role="dialog"], [role="alertdialog"], dialog[open]',
            ) &&
            !hasActiveCanvasGesture()
          ) {
            const action = event.shiftKey ? moveHistory.redo : moveHistory.undo;
            if (!moveHistory.pending && !action.disabled) {
              event.preventDefault();
              event.stopPropagation();
              if (event.shiftKey) moveHistory.onRedo();
              else moveHistory.onUndo();
            }
            return;
          }
          if (
            !(target instanceof HTMLElement) ||
            (target.dataset.canvasNoteSurface !== "true" &&
              target.dataset.adoptTarget !== "true") ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229 ||
            event.key === "Escape" ||
            event.key === "Tab"
          )
            return;
          const activeGesture = hasActiveCanvasGesture();
          if (event.key === "Enter" || event.key === " ") {
            if (activeGesture) cancelledCanvasKeyClicksRef.current.add(target);
            else if (!event.repeat)
              cancelledCanvasKeyClicksRef.current.delete(target);
          }
          if (event.ctrlKey || event.metaKey || event.altKey) return;
          const customSemanticKey =
            event.key === "Enter" ||
            event.key === " " ||
            (target.dataset.canvasNoteSurface === "true" &&
              (event.key === "Delete" ||
                event.key === "Backspace" ||
                (event.shiftKey && event.key === "F10") ||
                event.code === "Space" ||
                event.key.length === 1));
          if (activeGesture && customSemanticKey) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onPointerMove={handleRootPointerMove}
        onPointerUp={(event) => {
          if (rootPressRef.current?.pointerId === event.pointerId) {
            rootPressRef.current = null;
            setRootPointerPressed(false);
          }
          handleRootPointerEnd(event);
        }}
        onPointerCancel={(event) => {
          if (rootPressRef.current?.pointerId === event.pointerId)
            cancelRootPress();
          handleRootPointerCancel(event);
        }}
        onPointerLeave={() => setVoteStampPointer(null)}
      >
        <RoomBoardHeader
          loginReturnHref={loginReturnHref}
          onEditSelf={displayName?.request}
          hasMoveHistory={hasMoveHistory}
          onOpenFeedback={
            feedback
              ? (returnFocusTo) =>
                  feedback.open(
                    phase.kind === "step"
                      ? `${phase.phase}-${phase.step}`
                      : "unknown",
                    returnFocusTo,
                  )
              : undefined
          }
          hmwDecidedIssue={hmwDecidedIssue}
          decidedHmw={decidedHmw}
          issueReference={issueReference}
          hmwReference={hmwReference}
          inviteCode={inviteCode}
          inviteUrl={inviteUrl}
          phase={phase}
          phaseRevision={phaseRevision}
          bulkExclusionTargetCount={bulkExclusionTargetCount}
          canManageCandidates={
            isResultStep(phase) && decision === null && !isCandidatePending
          }
          onBulkCandidateExclude={onBulkCandidateExclude}
          sharing={sharing}
          onSharingStart={onSharingStart}
          onSharingAdvance={onSharingAdvance}
          timer={timer}
          timerServerOffsetMs={timerServerOffsetMs}
          timerUpdateVersion={timerUpdateVersion}
          isHost={isHost}
          hostRevision={hostRevision}
          onSelectHostTarget={
            onTransferHost
              ? (userId) => {
                  setHostTarget({ userId, revision: hostRevision });
                }
              : undefined
          }
          isTransferring={isTransferring}
          isDisconnected={isDisconnected}
          connectionStatus={connectionStatus}
          connectionDelayed={connectionDelayed}
          members={members}
          currentUserId={currentUserId}
          hostUserId={hostUserId}
          completedVoterIds={completedVoterIds}
          isNextPhasePending={isNextPhasePending}
          isNextPhaseBlocked={isNextPhaseBlocked}
          initialGuideState={initialGuideState}
          hasFinalDecision={hasFinalDecision}
          outcomePublished={outcomePublished}
          onPublishOutcome={onPublishOutcome}
          onShowOutcome={() => setOutcomeDismissed(false)}
          signOutAction={signOutAction}
          isLeaving={isLeaving}
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
            onHmwTemplateSelect={(content) => {
              onHmwTemplateSelect(content);
              setExpandPrivateNotesRequest((request) => request + 1);
            }}
            onIdeaHintSelect={(content) => {
              onIdeaHintSelect(content);
              setExpandPrivateNotesRequest((request) => request + 1);
            }}
          />
        </RoomBoardHeader>

        {isAdoptMode && interactionTool === "hand" ? (
          <p
            role="status"
            className="pointer-events-none absolute bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-background px-3 py-2 text-sm shadow"
          >
            採用するには「選択」に戻してください
          </p>
        ) : null}
        <RoomBoardCanvas
          authorName={(authorId) =>
            members.find((m) => m.userId === authorId)?.name ??
            authorNames?.get(authorId)
          }
          moveHistory={moveHistory}
          notes={renderedNotes}
          groups={groups}
          phase={phase}
          permissions={permissions}
          decision={decision}
          adoptionFocusNoteId={adoptionFocusNoteId}
          isHost={isHost}
          privateNotes={toolbarNotes}
          canPublishPrivateNote={canPublishNoteInTurn(
            phase,
            sharing,
            currentUserId,
          )}
          expandPrivateNotesRequest={expandPrivateNotesRequest}
          privateNoteAddRef={privateNoteAddRef}
          noteCreationPending={noteCreationPending}
          noteCreationReceipt={noteCreationReceipt}
          noteCreationSupported={noteCreationSupported}
          noteCreationFocusContext={`${phaseKey}:${phaseRevision ?? ""}`}
          selectedNoteId={selectedNoteId}
          selectedNoteIds={selectedNoteIds}
          interactionTool={interactionTool}
          onToolChange={changeTool}
          toolDisabled={
            rootPointerPressed ||
            selection.hasGesture() ||
            isNoteDragging ||
            isPanning ||
            voteStickerDrag !== null
          }
          marquee={selection.marquee}
          pendingCandidateNoteIds={pendingCandidateNoteIds}
          draggingNoteId={draggingNoteId}
          localDraggingNoteId={interactions.localDraggingNoteId}
          isDisconnected={isDisconnected}
          ideaMapSizeLevel={ideaMapSizeLevel}
          ideaMapSizeInitialized={ideaMapSizeInitialized}
          ideaMapIsDragging={ideaMapIsDragging || isNoteDragging}
          onIdeaMapResize={onIdeaMapResize}
          voteRemaining={voteRemaining}
          selectedVoteKind={selectedVoteKind}
          pendingVoteOperations={pendingVoteOperations}
          dragGhost={dragGhost}
          dragPreview={dragPreview}
          isReturnDropTarget={isReturnDropTarget}
          privateDropPlaceholder={privateDropPlaceholder}
          boardScrollerRef={boardScrollerRef}
          ideaMapPlaneRef={ideaMapPlaneRef}
          privateToolbarRef={privateToolbarRef}
          camera={camera}
          gridStyle={gridStyle}
          isPanning={isPanning}
          onCanvasPointerDown={(event) => {
            handleCanvasPointerDown(event);
            if (
              !interactions.hasPan?.() &&
              !isNoteDragging &&
              voteStickerDragRef.current === null &&
              interactionTool === "select" &&
              selectedVoteKind === null &&
              !isAdoptMode
            )
              if (selection.onPointerDown(event))
                interactions.onGestureBlockedChange?.(true);
          }}
          onCanvasPointerMove={(event) => {
            if (!selection.onPointerMove(event)) handleCanvasPointerMove(event);
          }}
          onCanvasPointerEnd={(event) => {
            if (
              event.type === "pointercancel" ||
              event.type === "lostpointercapture"
            ) {
              if (selection.hasPointer(event.pointerId)) selection.cancel();
            } else selection.onPointerEnd(event);
            handleCanvasPointerEnd(event);
          }}
          onNotePointerCaptureLost={interactions.onPointerCaptureLost}
          onPresencePointerMove={handlePresencePointerMove}
          onPresencePointerLeave={handlePresencePointerLeave}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
          onFitToNotes={() => {
            const viewport = boardScrollerRef.current;
            if (viewport && fitToNotes(getBoardFitInsets(viewport)) === false)
              roomNotify.canvasFitUnavailable();
          }}
          onSelect={handleNoteSelect}
          onNoteDragStart={(noteId, event, origin) => {
            const ids = selection.selectionRef.current;
            if (ids.length > 1 && ids.includes(noteId)) {
              if (interactions.onSharedNotesDragIntent)
                interactions.onSharedNotesDragIntent(
                  [...ids],
                  event,
                  origin,
                  noteId,
                );
              else roomNotify.multipleNoteMoveUnavailable();
              return;
            }
            handleSharedNoteDragStart(noteId, event, origin);
          }}
          onNoteContentChange={onNoteContentChange}
          draftValue={draftValue}
          onDraftChange={onDraftChange}
          onDraftCompositionStart={onDraftCompositionStart}
          onDraftCompositionEnd={onDraftCompositionEnd}
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
            className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-end lg:justify-center min-[640px]:max-[1023px]:bottom-[calc(5.25rem+var(--board-notification-inset,0px))] max-[639px]:justify-center max-[639px]:bottom-[var(--board-mobile-controls-bottom)]"
            data-testid="vote-palette-hud"
            data-board-fit-edge="bottom"
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
          className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex justify-center max-[639px]:bottom-[var(--board-mobile-phase-bottom)]"
          data-testid="phase-loop-hud"
          data-board-fit-edge="bottom"
        >
          <PhaseLoopControls
            key={`${phaseKey}:${phaseRevision}:${hostRevision}:${connectionStatus}`}
            phase={phase}
            isHost={isHost}
            isSelecting={isAdoptMode}
            decisionContent={decisionContent}
            candidateCount={candidateNotes.length}
            disabled={
              isDisconnected ||
              isNextPhasePending ||
              isCandidatePending ||
              isTransferring
            }
            onRestartWriting={onRestartWriting}
            onRevote={onRevote}
            onStartSelection={() => {
              setSelectedNoteId(null);
              setAdoptHostRevision(hostRevision);
              setIsAdoptMode(true);
            }}
            onCancelSelection={() => setIsAdoptMode(false)}
            onClearDecision={outcomePublished ? undefined : onDecisionClear}
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

        {isHost &&
        !outcomePublished &&
        onTransferHost &&
        hostTarget?.revision === hostRevision ? (
          <HostTransferDialog
            key={hostRevision}
            open
            onOpenChange={(open) => {
              if (!open) setHostTarget(null);
            }}
            target={
              members.find((member) => member.userId === hostTarget?.userId) ??
              null
            }
            onRequestRemove={
              memberRemoval && hostTarget
                ? () => {
                    memberRemoval.request(hostTarget.userId);
                    setHostTarget(null);
                  }
                : undefined
            }
            onConfirm={onTransferHost}
            pending={isTransferring}
            disconnected={isDisconnected}
            blocked={isNextPhasePending || isLeaving}
            error={transferError}
            onClosed={() => {
              // 選択行はPopoverの退出アニメーション中もDOMに残る。
              // 行へ戻すと直後のunmountでfocusを失うため、常設入口に戻す。
              boardRootRef.current
                ?.querySelector<HTMLButtonElement>(
                  "[data-host-transfer-origin]",
                )
                ?.focus();
            }}
          />
        ) : null}
        {displayName ? <RoomDisplayNameDialog controls={displayName} /> : null}
        {memberRemoval ? (
          <MemberRemoveDialog
            {...memberRemoval}
            onClosed={() => {
              boardRootRef.current
                ?.querySelector<HTMLButtonElement>(
                  "[data-host-transfer-origin]",
                )
                ?.focus();
            }}
          />
        ) : null}
        <LeaveConfirmDialog
          key={`${hostRevision}:${outcomePublished}`}
          open={leaveDialogOpen && !isTransferring}
          onOpenChange={setLeaveDialogOpen}
          onConfirm={onLeave}
          isLeaving={isLeaving}
          mode={isHost && !outcomePublished ? "disband" : "leave"}
          completed={outcomePublished}
          onReturnToOutcome={() => setOutcomeDismissed(false)}
        />
      </div>
      {feedback ? <FeedbackPanel feedback={feedback} /> : null}
    </>
  );
}
