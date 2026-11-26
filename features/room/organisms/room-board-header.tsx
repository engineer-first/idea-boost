"use client";

// ボード画面の進行レールと操作 HUD。

import {
  Check,
  DoorOpen,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  isPhaseStep,
  isRestartWritingAllowedStep,
  isResultStep,
  isVotingStep,
  type RoomPhase,
} from "@/contracts/phase";
import type {
  Carryover,
  SharingState,
  TimerState,
} from "@/contracts/room-protocol";
import { SignOutControl } from "@/features/auth";
import {
  buildInviteMessage,
  CopyInviteButton,
  InviteUrlActions,
} from "@/features/invite";
import {
  MemberAvatar,
  MemberSelection,
  NOTE_COLOR_NAMES,
} from "@/features/room-members";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import { isIdeaMapViewportStep } from "../logic/idea-value-feasibility-map";
import type { Member, PhaseProgressState } from "../logic/room-reducer";
import { useCompletionCue } from "../logic/use-completion-cue";
import { useRoomTimerSounds } from "../logic/use-room-timer-sounds";
import { BoardContext } from "../molecules/board-context";
import { NextPhaseConfirmDialog } from "../molecules/next-phase-confirm-dialog";
import { PhaseRollbackDialog } from "../molecules/phase-rollback-dialog";
import { PhaseStepTrail } from "../molecules/phase-step-trail";
import { RestartWritingConfirmDialog } from "../molecules/restart-writing-confirm-dialog";
import { RoomConnectionNotice } from "../molecules/room-connection-notice";
import { SharingAnnouncement } from "../molecules/sharing-announcement";
import { SharingPresenter } from "../molecules/sharing-presenter";
import { StepOneOnboardingSlide } from "../molecules/step-one-onboarding-slide";
import { TimerSoundControl } from "../molecules/timer-sound-control";
import styles from "./room-board-header.module.css";
import { RoomTimer } from "./room-timer";

const IDEA_MAP_CONTEXT_GAP = 18;
function getRecommendedTimerDurationMs(phase: RoomPhase): number {
  return (getFacilitationGuide(phase)?.durationMinutes ?? 3) * 60_000;
}

export type RoomBoardHeaderProps = {
  children?: ReactNode;
  hasMoveHistory?: boolean;
  onOpenFeedback?: (returnFocusTo: HTMLButtonElement | null) => void;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
  issueReference?: Carryover | null;
  hmwReference?: Carryover | null;
  loginReturnHref?: string;
  inviteCode: string;
  inviteUrl: string;
  phase: RoomPhase;
  phaseRevision?: number;
  isAdditionalWriting?: boolean;
  rollbackTarget?: RoomPhase | null;
  onRollbackPhase?: () => void;
  sharing?: SharingState | null;
  hasNoUnsharedNotes?: boolean;
  onSharingStart?: (durationMs: number) => void;
  onSharingAdvance?: (outcome: "done" | "passed") => void;
  onRestartWriting?: () => void;
  timer: TimerState;
  timerServerOffsetMs: number;
  timerUpdateVersion?: number;
  // ハイドレーション対策込みの「操作を止めるべきか」。判定は view の責務。
  isDisconnected: boolean;
  connectionStatus: RoomScreenConnectionStatus;
  members: Member[];
  currentUserId: string;
  completedVoterIds?: ReadonlyArray<string>;
  progress?: PhaseProgressState;
  onToggleReady?: ((ready: boolean) => boolean) | ((ready: boolean) => void);
  completionResetVersion?: number;
  isNextPhasePending: boolean;
  onEditSelf?: () => void;
  roomName?: string | null;
  onRenameRoom?: () => void;
  roomNameDisabled?: boolean;
  onSelectMember?: (userId: string) => void;
  isRemovingMember?: boolean;
  // 「次のステップへ」を進められない状態（決定待ち・次ステップ未実装など）。
  // 判定は view の責務で、ここでは受け取った状態で無効化するだけ。
  isNextPhaseBlocked: boolean;
  hasCurrentDecision?: boolean;
  hasFinalDecision: boolean;
  outcomePublished: boolean;
  isLeaving: boolean;
  sessionKind?: "guest" | "account";
  signOutAction?: () => Promise<void>;
  onShowOutcome?: () => void;
  onPublishOutcome: () => void;
  onLeaveClick: () => void;
  onNextPhase: (confirmedProgressRevision?: number) => void;
  onTimerStart: (durationMs: number) => void;
  onTimerPause: () => void;
  onTimerResume: () => void;
  onTimerExtend: () => void;
  onTimerStop: () => void;
};

export function RoomBoardHeader({
  children,
  hasMoveHistory = false,
  onOpenFeedback,
  hmwDecidedIssue,
  decidedHmw,
  issueReference,
  hmwReference,
  loginReturnHref,
  inviteCode,
  inviteUrl,
  phase,
  phaseRevision = 0,
  isAdditionalWriting = false,
  rollbackTarget = null,
  onRollbackPhase,
  sharing = null,
  hasNoUnsharedNotes = false,
  onSharingStart,
  onSharingAdvance,
  onRestartWriting,
  timer,
  timerServerOffsetMs,
  timerUpdateVersion = 0,
  isDisconnected,
  connectionStatus,
  members,
  currentUserId,
  completedVoterIds = [],
  progress = {
    phaseRevision: 0,
    progressRevision: 0,
    connectedUserIds: [],
    readyUserIds: [],
    notReadyUserIds: [],
    canAdvance: false,
    allReady: false,
  },
  onToggleReady,
  completionResetVersion = 0,
  isNextPhasePending,
  onSelectMember,
  onEditSelf,
  roomName,
  onRenameRoom,
  roomNameDisabled,
  isRemovingMember = false,
  isNextPhaseBlocked,
  hasFinalDecision,
  outcomePublished,
  isLeaving,
  signOutAction,
  sessionKind,
  onShowOutcome,
  onPublishOutcome,
  onLeaveClick,
  onNextPhase,
  onTimerStart,
  onTimerResume,
  onTimerExtend,
}: RoomBoardHeaderProps) {
  const t = useTranslations("app.boardHeader");
  const controlsAreaRef = useRef<HTMLDivElement>(null);
  const isIdeaMapWorkspaceStep =
    isPhaseStep(phase, 3, 2) || isPhaseStep(phase, 3, 3);
  const additionalWritingMap = isAdditionalWriting && isPhaseStep(phase, 3, 1);
  const usesIdeaMapViewport =
    isIdeaMapViewportStep(phase) || additionalWritingMap;
  const mapLayoutBeforeWritingRef = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    const area = controlsAreaRef.current;
    const header = area?.closest<HTMLElement>(
      '[data-testid="board-header-row"]',
    );
    const board = header?.closest<HTMLElement>(
      '[data-testid="room-board-view-root"]',
    );
    if (!area || !header) return;
    // 追加執筆の3-1は書き足し前のマップ位置を保ち、共通の配置だけを更新する。
    const keptMapLayout =
      additionalWritingMap && board ? mapLayoutBeforeWritingRef.current : null;
    if (keptMapLayout && board)
      for (const [property, value] of Object.entries(keptMapLayout))
        board.style.setProperty(property, value);
    function updateBoardLayoutOffsets(): void {
      const notice =
        connectionStatus === "open"
          ? null
          : area?.querySelector<HTMLElement>(
              '[data-testid="board-connection-status"]',
            );
      if (!header) return;
      // 復元したマップ位置は再計算で上書きも削除もしない。
      if (usesIdeaMapViewport && board && !keptMapLayout) {
        const boardTop = board.getBoundingClientRect().top;
        const location = header.querySelector<HTMLElement>(
          '[data-testid="board-location-card"]',
        );
        const helpToggle = isIdeaMapWorkspaceStep
          ? header
              .querySelector<HTMLElement>('[data-testid="board-help-panel"]')
              ?.querySelector<HTMLElement>("[data-help-toggle]")
          : null;
        const contextColumn = header.querySelector<HTMLElement>(
          '[data-testid="board-context-column"]',
        );
        const locationBottom =
          location?.getBoundingClientRect().bottom ?? boardTop;
        const controlsBottom = area?.getBoundingClientRect().bottom ?? boardTop;
        // 3-2/3-3ではヒントを描画しないが、マップ位置は従来の閉じたヒント行
        // を含む位置で固定する。行自体はDOMに残さず、既存のモバイルgrid寸法から算出する。
        const helpRowBottom =
          helpToggle?.getBoundingClientRect().bottom ??
          (window.innerWidth <= 639
            ? (contextColumn?.getBoundingClientRect().top ?? boardTop) +
              (location?.parentElement?.getBoundingClientRect().height ?? 80) +
              50 +
              8 +
              36
            : boardTop);
        const mapTop =
          window.innerWidth >= 900
            ? Math.max(controlsBottom, locationBottom) - boardTop + 50
            : window.innerWidth <= 639
              ? Math.max(locationBottom, controlsBottom, helpRowBottom) -
                boardTop +
                25
              : Math.max(locationBottom, controlsBottom) - boardTop + 24;
        // 狭幅の投票完了表示用余白は周辺UIに残し、マップ位置には足さない。
        const votingStatusPadding =
          !isIdeaMapWorkspaceStep && window.innerWidth <= 900 && area
            ? Number.parseFloat(getComputedStyle(area).paddingBottom) || 0
            : 0;
        board.style.setProperty(
          "--board-map-top",
          `${mapTop - votingStatusPadding}px`,
        );
        if (window.innerWidth >= 900) {
          const context = header.querySelector<HTMLElement>(
            '[data-testid="board-context-hud"]',
          );
          const mapPlane = board.querySelector<HTMLElement>(
            '[data-testid="idea-value-feasibility-map-plane"]',
          );
          if (context && mapPlane) {
            const currentShift =
              Number.parseFloat(
                board.style.getPropertyValue("--board-map-shift-y"),
              ) || 0;
            const targetTop =
              context.getBoundingClientRect().bottom + IDEA_MAP_CONTEXT_GAP;
            const correction = targetTop - mapPlane.getBoundingClientRect().top;
            board.style.setProperty(
              "--board-map-shift-y",
              `${currentShift + correction}px`,
            );
          }
        } else {
          board.style.removeProperty("--board-map-shift-y");
        }
        const noticeBottom =
          notice && board
            ? notice.getBoundingClientRect().bottom - boardTop + 8
            : 72;
        board.style.setProperty("--board-map-tray-top", `${noticeBottom}px`);
      } else if (!keptMapLayout) {
        board?.style.removeProperty("--board-map-top");
        board?.style.removeProperty("--board-map-shift-y");
        board?.style.removeProperty("--board-map-tray-top");
      }
      const bottom = notice
        ? notice.getBoundingClientRect().bottom -
          header.getBoundingClientRect().top +
          8
        : 0;
      header.style.setProperty("--board-connection-guide-top", `${bottom}px`);
      // 付箋一覧にも案内の実寸を予約し、一覧の上端やスクロールを覆わない。
      const dockTop =
        notice && board
          ? notice.getBoundingClientRect().bottom -
            board.getBoundingClientRect().top +
            8
          : 0;
      board?.style.setProperty(
        "--board-connection-notice-bottom",
        `${dockTop}px`,
      );
      const location = header.querySelector<HTMLElement>(
        '[data-testid="board-location-card"]',
      );
      if (location) {
        header.style.setProperty(
          "--board-location-top",
          `${location.getBoundingClientRect().top}px`,
        );
        // 一覧はスロットの上に展開するため、周辺配置には常設部分の高さだけを使う。
        header.style.setProperty(
          "--board-location-height",
          `${location.parentElement?.getBoundingClientRect().height ?? 80}px`,
        );
      }
    }
    updateBoardLayoutOffsets();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateBoardLayoutOffsets);
    observer?.observe(area);
    if (usesIdeaMapViewport) observer?.observe(header);
    const location = header.querySelector<HTMLElement>(
      '[data-testid="board-location-card"]',
    );
    if (location?.parentElement) observer?.observe(location.parentElement);
    window.addEventListener("resize", updateBoardLayoutOffsets);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateBoardLayoutOffsets);
      header.style.removeProperty("--board-connection-guide-top");
      header.style.removeProperty("--board-location-top");
      header.style.removeProperty("--board-location-height");
      board?.style.removeProperty("--board-connection-notice-bottom");
      if (usesIdeaMapViewport && !additionalWritingMap && board) {
        mapLayoutBeforeWritingRef.current = Object.fromEntries(
          [
            "--board-map-top",
            "--board-map-shift-y",
            "--board-map-tray-top",
          ].map((property) => [
            property,
            board.style.getPropertyValue(property),
          ]),
        );
      }
      board?.style.removeProperty("--board-map-top");
      board?.style.removeProperty("--board-map-shift-y");
      board?.style.removeProperty("--board-map-tray-top");
    };
  }, [
    connectionStatus,
    isIdeaMapWorkspaceStep,
    usesIdeaMapViewport,
    additionalWritingMap,
  ]);
  const activeSharing =
    phase.kind === "step" && phase.step === 2 ? sharing : null;
  const transitioning = activeSharing?.startsAt != null;
  const presenter =
    activeSharing?.currentIndex != null
      ? activeSharing.order[activeSharing.currentIndex]
      : null;
  const canStartSharing =
    presenter !== null || activeSharing?.status === "ready";
  const canAdvanceSharing = presenter !== null;
  const isLastPresenter =
    activeSharing?.status === "active" &&
    activeSharing.currentIndex !== null &&
    activeSharing.currentIndex === activeSharing.order.length - 1;
  const canCompleteSharing = activeSharing?.status === "complete";
  // 書き足しは共有の一巡後と、その後の投票前のステップで、同じ上部の操作欄から出す。
  const canRestartWriting =
    canCompleteSharing ||
    (isRestartWritingAllowedStep(phase) &&
      phase.kind === "step" &&
      phase.step > 2);
  const sharingDuration = activeSharing?.durationMs ?? 180000;
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const canSelectMember = !outcomePublished && onSelectMember;
  const roomActionDisabled =
    isDisconnected || isNextPhasePending || isRemovingMember || isLeaving;
  const roomMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const readyButtonRef = useRef<HTMLButtonElement>(null);
  const roomMenuContentRef = useRef<HTMLDivElement>(null);
  const inviteContentRef = useRef<HTMLDivElement>(null);
  const feedbackOpening = useRef(false);
  useEffect(() => {
    if (!roomMenuOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        roomMenuTriggerRef.current?.contains(target) ||
        roomMenuContentRef.current?.contains(target) ||
        inviteContentRef.current?.contains(target) ||
        (target instanceof Element &&
          target.closest("[data-phase-rollback-dialog]"))
      )
        return;
      // ボードのパン開始はpointerdownの伝播を止めるため、その前に判定する。
      // 元のクリックやドラッグは消費せず、通常の操作へ渡す。
      setRoomMenuOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () =>
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true,
      );
  }, [roomMenuOpen]);
  const isCurrentVotingStep = isVotingStep(phase);
  const votingAllComplete =
    !isCurrentVotingStep ||
    (progress.connectedUserIds.length > 0 &&
      progress.connectedUserIds.every((userId) =>
        completedVoterIds.includes(userId),
      ));
  const isManualProgressStep = phase.kind === "step";
  const isCurrentUserReady =
    activeSharing === null && progress.readyUserIds.includes(currentUserId);
  const canProceedByTimeOrReady = progress.allReady || timer.status === "ended";
  const sharingCompletionDisabled =
    activeSharing !== null &&
    (activeSharing.status !== "active" ||
      transitioning ||
      presenter?.userId !== currentUserId ||
      !onSharingAdvance);
  const canPublishOutcome =
    canProceedByTimeOrReady &&
    hasFinalDecision &&
    !isDisconnected &&
    !isRemovingMember &&
    !isNextPhasePending;
  // 採用後に完了を待っている間は、1-5・2-4 の「次へ」と同じく何を待っているかを示す。
  const finalCompletionWaitingLabel = isDisconnected
    ? t("completionWaitingReconnect")
    : !hasFinalDecision
      ? t("completionWaitingAdoption")
      : !canProceedByTimeOrReady && progress.notReadyUserIds.length > 0
        ? t("completionWaitingMembers", {
            count: progress.notReadyUserIds.length,
          })
        : null;
  const completionCue = useCompletionCue({
    scope: `${inviteCode}:${currentUserId}:${JSON.stringify(phase)}:${phaseRevision}:${completionResetVersion}`,
    disabled:
      isDisconnected ||
      isNextPhasePending ||
      isRemovingMember ||
      isLeaving ||
      outcomePublished,
    ready: isCurrentUserReady,
    canAdvance: progress.canAdvance,
    onReady: onToggleReady,
  });
  const votesRemaining =
    isCurrentVotingStep &&
    !isCurrentUserReady &&
    !completedVoterIds.includes(currentUserId);
  // 押した直後の演出中（completionCue.busy）は押し済みの塗りを保ち、本当に押せない間だけ破線で示す。
  const readyButtonUnavailable =
    roomActionDisabled || sharingCompletionDisabled || votesRemaining;
  const readyButtonDisabled = readyButtonUnavailable || completionCue.busy;
  const sharingTurnKey =
    activeSharing?.status === "active"
      ? `${inviteCode}:${currentUserId}:${phaseRevision}:${activeSharing.revision}`
      : null;
  const [dismissedSharingTurnKey, setDismissedSharingTurnKey] = useState<
    string | null
  >(null);
  if (
    dismissedSharingTurnKey !== null &&
    (!hasNoUnsharedNotes || dismissedSharingTurnKey !== sharingTurnKey)
  ) {
    setDismissedSharingTurnKey(null);
  }
  const showSharingCompletionCue =
    hasNoUnsharedNotes &&
    sharingTurnKey !== null &&
    !readyButtonDisabled &&
    dismissedSharingTurnKey !== sharingTurnKey;
  // 狭幅でも本人を省略しない。順番は操作中の状態で変えない。
  const hudMembers = isManualProgressStep
    ? [...members].sort(
        (a, b) =>
          Number(b.userId === currentUserId) -
          Number(a.userId === currentUserId),
      )
    : members;
  const notReadyNames = members
    .filter((member) => progress.notReadyUserIds.includes(member.userId))
    .map((member) => member.name);
  const notReadyMembers = members.filter((member) =>
    progress.notReadyUserIds.includes(member.userId),
  );
  const requireProgressConfirmation = !progress.allReady;
  const showVotingCompletion =
    isCurrentVotingStep &&
    members.length > 0 &&
    progress.connectedUserIds.length > 0 &&
    votingAllComplete &&
    !isDisconnected;
  const completedMemberIds = progress.readyUserIds;
  const completionLabel = t(
    isCurrentVotingStep ? "votingComplete" : "workComplete",
  );
  const timerSoundControls = useRoomTimerSounds({
    timer,
    serverOffsetMs: timerServerOffsetMs,
    timerUpdateVersion,
    votingCompletion: {
      roundKey:
        isCurrentVotingStep && phase.kind === "step"
          ? `phase-${phase.phase}`
          : null,
      isComplete: isCurrentVotingStep && votingAllComplete,
      isDisconnected,
    },
  });
  const guidePhaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby";
  const automaticStarterId = progress.connectedUserIds
    .filter((id) => members.some((member) => member.userId === id))
    .sort()[0];
  const isAutomaticStarter = automaticStarterId === currentUserId;
  const [readyGuidePhaseKey, setReadyGuidePhaseKey] = useState<string | null>(
    null,
  );
  const requestedTimerStart = useRef<string | null>(null);
  const handleGuidePhaseReady = useCallback(
    (readyPhaseKey: string) => {
      if (readyPhaseKey === guidePhaseKey) setReadyGuidePhaseKey(readyPhaseKey);
    },
    [guidePhaseKey],
  );
  useEffect(() => {
    if (isDisconnected) {
      requestedTimerStart.current = null;
      return;
    }
    if (
      (isPhaseStep(phase, 1, 1) && readyGuidePhaseKey !== guidePhaseKey) ||
      phase.kind !== "step" ||
      !isAutomaticStarter ||
      isRemovingMember ||
      isNextPhasePending ||
      outcomePublished ||
      timer.status !== "idle"
    )
      return;
    const startKey = `${inviteCode}:${currentUserId}:${phaseRevision}:${guidePhaseKey}:${activeSharing?.revision ?? ""}`;
    if (requestedTimerStart.current === startKey) return;
    if (phase.step === 2) {
      if (
        activeSharing?.status === "ready" &&
        !transitioning &&
        onSharingStart
      ) {
        requestedTimerStart.current = startKey;
        onSharingStart(sharingDuration);
      }
      return;
    }
    requestedTimerStart.current = startKey;
    onTimerStart(getRecommendedTimerDurationMs(phase));
  }, [
    guidePhaseKey,
    phase,
    isAutomaticStarter,
    readyGuidePhaseKey,
    inviteCode,
    currentUserId,
    phaseRevision,
    isDisconnected,
    isRemovingMember,
    isNextPhasePending,
    outcomePublished,
    timer.status,
    activeSharing,
    transitioning,
    onSharingStart,
    sharingDuration,
    onTimerStart,
  ]);
  const handleInitialOnboardingReady = useCallback(
    () => handleGuidePhaseReady("1-1"),
    [handleGuidePhaseReady],
  );
  const isPhaseOnePrivateNoteEntry = isPhaseStep(phase, 1, 1);
  const isPhaseThreePrivateNoteEntry =
    phase.kind === "step" && phase.phase === 3 && phase.step === 1;
  const isFinalStep = isPhaseStep(phase, 3, 5);
  const currentMember = members.find(
    (member) => member.userId === currentUserId,
  );
  const leaveLabel = t(isLeaving ? "leaving" : "leave");

  // 交代の瞬間だけでなく発表中ずっと出し、誰の番かをボードを見たまま分かるようにする。
  const sharingAnnouncement =
    activeSharing?.status === "active" && presenter ? (
      <SharingAnnouncement
        member={presenter}
        isSelf={presenter.userId === currentUserId}
      />
    ) : null;

  return (
    <TooltipProvider>
      <div
        data-testid="board-header-row"
        data-map-workspace={isIdeaMapWorkspaceStep || undefined}
        className={`pointer-events-none absolute inset-x-3 top-3 bottom-[7.5rem] z-40 max-[639px]:z-[41] has-[[data-location-open=true]]:z-[60] grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 max-[900px]:grid-cols-[306px_minmax(0,1fr)] max-[639px]:grid-cols-1 max-[639px]:grid-rows-[auto_minmax(0,1fr)] max-[639px]:group-has-[[data-expanded=true]]/board:bottom-[calc(var(--board-private-dock-bottom,7.5rem)+var(--board-private-dock-height,20rem)+0.75rem)] max-[639px]:gap-2 ${isPhaseThreePrivateNoteEntry ? "min-[640px]:bottom-3" : ""} ${hasMoveHistory ? "max-[639px]:bottom-[var(--board-mobile-header-bottom)]" : phase.kind === "step" && phase.step === 2 ? "max-[639px]:bottom-[16rem]" : "max-[639px]:bottom-[11rem]"}`}
      >
        <div
          className="pointer-events-none flex h-full w-full max-w-[360px] min-h-0 min-w-0 flex-col items-start gap-3 min-[900px]:max-[1200px]:max-w-[306px] max-[900px]:min-w-[306px] max-[639px]:relative max-[639px]:grid max-[639px]:grid-cols-[200px_minmax(0,1fr)] max-[639px]:grid-rows-[calc(var(--board-location-height,80px)+50px)_auto] max-[639px]:items-start max-[639px]:max-w-none max-[639px]:min-w-0 max-[639px]:h-auto max-[639px]:max-h-full max-[639px]:gap-2 max-[639px]:overflow-y-auto max-[639px]:has-[[data-location-open=true]]:overflow-visible max-[639px]:overscroll-contain max-[639px]:pointer-events-auto"
          data-testid="board-context-column"
          data-board-fit-edge="top"
        >
          <div className="w-full min-w-0 shrink-0 max-[640px]:max-w-[306px] max-[639px]:col-start-1 max-[639px]:row-start-1 max-[639px]:row-span-2 max-[639px]:w-[min(306px,calc(100vw-24px))]">
            <BoardContext
              initialDisclosureId={usesIdeaMapViewport ? null : undefined}
              phase={phase}
              outcomePublished={outcomePublished}
              hmwDecidedIssue={hmwDecidedIssue}
              decidedHmw={decidedHmw}
              issueReference={issueReference}
              hmwReference={hmwReference}
              guideControl={
                <StepOneOnboardingSlide
                  phaseKey={
                    phase.kind === "step"
                      ? `${phase.phase}-${phase.step}`
                      : "lobby"
                  }
                  userId={currentUserId}
                  isReady={!isDisconnected}
                  onReady={handleInitialOnboardingReady}
                />
              }
            />
          </div>
          {sharingAnnouncement}
          {!isIdeaMapWorkspaceStep ||
          (children !== null && children !== undefined) ? (
            <div
              className="pointer-events-none flex min-h-0 w-full flex-1 max-[639px]:col-start-2 max-[639px]:row-start-2 max-[639px]:max-h-[140px] max-[639px]:has-[[data-open=true]]:min-h-[140px] max-[639px]:has-[[data-open=false]]:min-h-9"
              data-testid="board-help-slot"
            >
              {children}
            </div>
          ) : null}
        </div>

        {/* 今のフェーズのステップの並びは、最上段の操作の真下・中央に常に出す。
            左右を現在地カードの右端で揃えて中央に置き、入り切らないときは左の欄に重ねず右へ寄せる。
            狭い幅では上段が折り返すため、左上の現在地だけで示す。 */}
        {phase.kind === "step" ? (
          <div
            className="pointer-events-none absolute inset-x-[var(--board-location-right,23.25rem)] top-[calc(3.5rem+0.75rem)] flex [justify-content:safe_center] max-[900px]:hidden"
            data-board-fit-edge="top"
          >
            <div data-board-fit-occupy="true">
              <PhaseStepTrail phase={phase} />
            </div>
          </div>
        ) : null}

        {/* 狭幅の完了表示は操作行の外へ置く。結果でも同じ縦余白を保ち、現在地表示を動かさない。 */}
        <div
          ref={controlsAreaRef}
          className={`pointer-events-none flex min-w-0 flex-col items-end gap-2 max-[900px]:max-w-[426px] max-[639px]:order-first max-[639px]:w-full ${isCurrentVotingStep || isResultStep(phase) ? "max-[900px]:pb-6" : ""}`}
        >
          <fieldset
            className={`board-hud pointer-events-auto relative flex ${canCompleteSharing ? "min-h-14 flex-wrap" : "h-14"} min-w-0 max-w-full shrink-0 items-center justify-end gap-1 rounded-xl border border-border bg-background p-1.5 shadow-tool max-[900px]:h-auto max-[900px]:max-w-[426px] max-[900px]:flex-wrap max-[639px]:order-first max-[639px]:w-full max-[639px]:justify-start max-[639px]:gap-0 max-[639px]:p-1 max-[639px]:[&>button]:px-2`}
            aria-label={t("roomControls")}
            data-completion-cue={completionCue.stage}
            data-testid="board-control-hud"
            data-board-fit-edge="top"
          >
            {isManualProgressStep ? (
              <span className="sr-only" aria-live="polite">
                {completionCue.stage === "waiting"
                  ? t("readyUpdating")
                  : isCurrentUserReady
                    ? t("readyForNext")
                    : t("working")}
              </span>
            ) : null}
            {canRestartWriting && onRestartWriting && phase.kind === "step" ? (
              <RestartWritingConfirmDialog
                key={`${phase.phase}:${phaseRevision}:${connectionStatus}`}
                phaseNumber={phase.phase}
                disabled={isDisconnected || isRemovingMember || isLeaving}
                pending={isNextPhasePending}
                compactOnNarrow={!canCompleteSharing}
                onConfirm={onRestartWriting}
              />
            ) : null}
            {!canCompleteSharing &&
            isManualProgressStep &&
            (onToggleReady || activeSharing) ? (
              <Button
                type="button"
                variant={isCurrentUserReady ? "secondary" : "outline"}
                ref={readyButtonRef}
                className={`text-sm h-10 w-[132px] max-[900px]:w-[116px] shrink-0 px-2 ${styles.readyButton}`}
                data-sharing-completion-cue={
                  showSharingCompletionCue || undefined
                }
                disabled={readyButtonDisabled}
                data-unavailable={readyButtonUnavailable || undefined}
                aria-busy={completionCue.stage === "waiting"}
                aria-pressed={activeSharing ? undefined : isCurrentUserReady}
                aria-label={
                  activeSharing
                    ? t("ready")
                    : isCurrentUserReady
                      ? t("undoReady")
                      : t("ready")
                }
                title={
                  activeSharing
                    ? isLastPresenter
                      ? t("finishPresentation")
                      : t("passToNext")
                    : isCurrentUserReady
                      ? t("alreadyReady")
                      : votesRemaining
                        ? t("useAllVotes")
                        : t("readyDescription")
                }
                onClick={() => {
                  if (activeSharing) {
                    if (showSharingCompletionCue)
                      setDismissedSharingTurnKey(sharingTurnKey);
                    onSharingAdvance?.("done");
                  } else if (isCurrentUserReady) onToggleReady?.(false);
                  else completionCue.request(null);
                }}
              >
                <span className={styles.completionMark} aria-hidden="true">
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>
                <span>{t("ready")}</span>
              </Button>
            ) : showVotingCompletion ? (
              <span
                className="shrink-0 max-[900px]:absolute max-[900px]:right-0 max-[900px]:top-full max-[900px]:mt-1 max-[900px]:rounded-full max-[900px]:bg-background max-[900px]:px-2"
                data-testid="vote-completion-indicator"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex max-w-20 items-center gap-1 overflow-hidden whitespace-nowrap text-xs font-semibold text-state-decided-text opacity-100 transition-[max-width,opacity] duration-[120ms] starting:max-w-0 starting:opacity-0 motion-reduce:transition-none"
                  data-testid="vote-completion-label"
                >
                  <Check className="size-3.5 shrink-0" />
                  {t("allReady")}
                </span>
                <span className="sr-only" role="status" aria-live="polite">
                  {t("allVotesComplete")}
                </span>
              </span>
            ) : null}
            {activeSharing ? (
              <SharingPresenter
                connectedUserIds={
                  progress.progressRevision > 0
                    ? progress.connectedUserIds
                    : undefined
                }
                onEditSelf={outcomePublished ? undefined : onEditSelf}
                sharing={activeSharing}
                currentUserId={currentUserId}
                onSelectMember={canSelectMember ? onSelectMember : undefined}
                selectionDisabled={roomActionDisabled}
                members={members}
                onPassPresenter={
                  canAdvanceSharing && onSharingAdvance
                    ? () => onSharingAdvance("passed")
                    : undefined
                }
                passDisabled={
                  isDisconnected || transitioning || isRemovingMember
                }
              />
            ) : (
              <Popover open={membersOpen} onOpenChange={setMembersOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-sm h-10 gap-2 px-2 max-[900px]:w-[52px] max-[900px]:gap-0 max-[900px]:px-0"
                    aria-label={t("participantsCount", {
                      count: members.length,
                    })}
                    data-member-menu-origin
                    title={t("openParticipants")}
                  >
                    <span
                      className="flex items-center pl-2 max-[900px]:pl-0"
                      aria-hidden="true"
                    >
                      {hudMembers.slice(0, 10).map((member, index) => (
                        <span
                          key={member.userId}
                          data-cue-self={
                            member.userId === currentUserId || undefined
                          }
                          data-cue-waiting={
                            (progress.notReadyUserIds.includes(member.userId) &&
                              member.userId !== currentUserId) ||
                            undefined
                          }
                          className={`${styles.avatarCue} relative ${
                            index >= 3
                              ? "hidden xl:inline-flex"
                              : index >= 1
                                ? "hidden lg:inline-flex"
                                : "inline-flex"
                          } ${index > 0 ? "-ml-2" : ""}`}
                          style={{ zIndex: 10 - index }}
                        >
                          <MemberAvatar
                            name={member.name}
                            avatarId={member.avatarId}
                            color={member.color}
                            size={28}
                            isMe={member.userId === currentUserId}
                            isVotingComplete={
                              completedMemberIds.includes(member.userId) &&
                              !(
                                member.userId === currentUserId &&
                                completionCue.hideSelfCheck
                              )
                            }
                            completionLabel={completionLabel}
                            isConnected={
                              progress.progressRevision > 0
                                ? progress.connectedUserIds.includes(
                                    member.userId,
                                  )
                                : undefined
                            }
                          />
                        </span>
                      ))}
                      <span
                        data-testid="member-overflow-indicator"
                        data-waiting-small={
                          hudMembers
                            .slice(1)
                            .some((m) =>
                              progress.notReadyUserIds.includes(m.userId),
                            ) || undefined
                        }
                        data-waiting-medium={
                          hudMembers
                            .slice(3)
                            .some((m) =>
                              progress.notReadyUserIds.includes(m.userId),
                            ) || undefined
                        }
                        data-waiting-large={
                          hudMembers
                            .slice(10)
                            .some((m) =>
                              progress.notReadyUserIds.includes(m.userId),
                            ) || undefined
                        }
                        className={`${styles.overflowCue} relative z-20 -ml-1 size-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-semibold tabular-nums text-foreground ${
                          members.length > 10
                            ? "inline-flex"
                            : members.length > 3
                              ? "inline-flex xl:hidden"
                              : members.length > 1
                                ? "inline-flex lg:hidden"
                                : "hidden"
                        }`}
                      >
                        <span className="hidden xl:inline">
                          +{Math.max(0, members.length - 10)}
                        </span>
                        <span className="hidden lg:inline xl:hidden">
                          +{Math.max(0, members.length - 3)}
                        </span>
                        <span className="lg:hidden">
                          +{Math.max(0, members.length - 1)}
                        </span>
                      </span>
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72"
                  aria-label={t("participantsList")}
                >
                  <p className="mb-3 text-base font-semibold">
                    {t("participantsCount", { count: members.length })}
                  </p>
                  <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto p-1">
                    {members.map((member) => (
                      <li
                        key={member.userId}
                        data-testid={`member-row-${member.userId}`}
                        data-self={
                          member.userId === currentUserId ? "true" : undefined
                        }
                        className="flex min-w-0 items-center gap-2"
                      >
                        <MemberSelection
                          name={
                            member.userId === currentUserId &&
                            onEditSelf &&
                            !outcomePublished
                              ? t("participantRename", { name: member.name })
                              : member.name
                          }
                          className="flex min-h-11 w-full min-w-0 items-center gap-2 p-1"
                          disabled={roomActionDisabled}
                          onSelect={
                            member.userId === currentUserId &&
                            onEditSelf &&
                            !outcomePublished
                              ? () => {
                                  setMembersOpen(false);
                                  onEditSelf();
                                }
                              : canSelectMember &&
                                  member.userId !== currentUserId
                                ? () => {
                                    setMembersOpen(false);
                                    onSelectMember?.(member.userId);
                                  }
                                : undefined
                          }
                        >
                          <MemberAvatar
                            name={member.name}
                            avatarId={member.avatarId}
                            color={member.color}
                            size={32}
                            isMe={member.userId === currentUserId}
                            isVotingComplete={completedMemberIds.includes(
                              member.userId,
                            )}
                            completionLabel={completionLabel}
                            isConnected={
                              progress.progressRevision > 0
                                ? progress.connectedUserIds.includes(
                                    member.userId,
                                  )
                                : undefined
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-base">
                            {member.name}
                          </span>
                          {member.userId === currentUserId &&
                          onEditSelf &&
                          !outcomePublished ? (
                            <Pencil
                              className="size-3 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          ) : null}
                          {members.filter((m) => m.name === member.name)
                            .length > 1 ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {NOTE_COLOR_NAMES[member.color]}
                            </span>
                          ) : null}
                          {member.userId === currentUserId ? (
                            <span className="text-xs text-muted-foreground">
                              {t("you")}
                            </span>
                          ) : null}
                        </MemberSelection>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            )}

            {activeSharing?.status === "ready" && canStartSharing ? (
              <Button
                className="text-sm h-10 shrink-0"
                disabled={isDisconnected || isRemovingMember}
                onClick={() => onSharingStart?.(sharingDuration)}
              >
                {t("startFirstPresenter")}
              </Button>
            ) : null}
            {isResultStep(phase) && isFinalStep ? (
              outcomePublished && hasFinalDecision ? (
                <Button
                  type="button"
                  className="text-sm h-10 shrink-0 px-3"
                  onClick={onShowOutcome}
                >
                  {t("viewOutcome")}
                </Button>
              ) : (
                <AlertDialog
                  key={`${phaseRevision}:${isDisconnected}:${isRemovingMember}`}
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant={canPublishOutcome ? "default" : "ghost"}
                      className={`text-sm h-10 shrink-0 px-3 max-[900px]:px-2 max-[900px]:text-sm max-[639px]:w-[116px] max-[639px]:whitespace-normal max-[639px]:leading-tight ${canPublishOutcome ? styles.nextReady : styles.nextWaiting}`}
                      disabled={!canPublishOutcome}
                    >
                      {/* 待ちの文言は通常の完了文言と同じ幅に重ね、隣の操作の位置を動かさない。 */}
                      <span className="grid justify-items-center">
                        <span className="inline-flex items-center gap-2 [grid-area:1/1]">
                          {finalCompletionWaitingLabel ?? (
                            <>
                              <Check
                                aria-hidden="true"
                                className="size-4 max-[639px]:hidden"
                              />
                              {t("publishOutcome")}
                            </>
                          )}
                        </span>
                        <span
                          aria-hidden="true"
                          className="invisible inline-flex items-center gap-2 [grid-area:1/1]"
                        >
                          <span className="size-4 max-[639px]:hidden" />
                          {t("publishOutcome")}
                        </span>
                      </span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent aria-describedby={undefined}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("completeSprint")}</AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={
                          isDisconnected ||
                          isRemovingMember ||
                          isNextPhasePending ||
                          !hasFinalDecision ||
                          !canProceedByTimeOrReady
                        }
                        onClick={onPublishOutcome}
                      >
                        {t("complete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )
            ) : phase.kind === "step" &&
              (!activeSharing || canCompleteSharing) ? (
              <NextPhaseConfirmDialog
                key={`${phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"}:${phaseRevision}:${isDisconnected}`}
                waiting={
                  isDisconnected
                    ? { kind: "connection" }
                    : isNextPhaseBlocked && isResultStep(phase)
                      ? { kind: "decision" }
                      : votesRemaining
                        ? { kind: "votes" }
                        : !canProceedByTimeOrReady
                          ? {
                              kind: "members",
                              remaining: progress.notReadyUserIds.length,
                              total: progress.connectedUserIds.length,
                            }
                          : undefined
                }
                disabled={
                  isDisconnected ||
                  isNextPhasePending ||
                  isNextPhaseBlocked ||
                  !votingAllComplete ||
                  (activeSharing !== null && !canCompleteSharing) ||
                  !canProceedByTimeOrReady ||
                  isRemovingMember ||
                  (canCompleteSharing && isLeaving)
                }
                onPendingPress={
                  // 人数待ちだけが理由のときに限り、押されたら「できた！」か未完了の人を示す。
                  isManualProgressStep &&
                  onToggleReady &&
                  !canCompleteSharing &&
                  activeSharing === null &&
                  !canProceedByTimeOrReady &&
                  !isDisconnected &&
                  !isNextPhasePending &&
                  !isNextPhaseBlocked &&
                  votingAllComplete &&
                  !isRemovingMember &&
                  !isLeaving
                    ? () => {
                        if (!isCurrentUserReady)
                          readyButtonRef.current?.focus();
                        completionCue.nudge();
                      }
                    : undefined
                }
                requireConfirmation={
                  canCompleteSharing ? false : requireProgressConfirmation
                }
                notReadyNames={notReadyNames}
                notReadyMembers={notReadyMembers}
                onConfirm={() => {
                  if (canCompleteSharing) onNextPhase();
                  else
                    onNextPhase(
                      progress.allReady ? undefined : progress.progressRevision,
                    );
                }}
              />
            ) : null}

            <Popover open={roomMenuOpen} onOpenChange={setRoomMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-8 shrink-0 p-0"
                  aria-label={t("openRoomMenu")}
                  ref={roomMenuTriggerRef}
                  data-testid="room-menu-trigger"
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                ref={roomMenuContentRef}
                className={
                  isPhaseOnePrivateNoteEntry ? "z-[70] w-80 p-2" : "w-80 p-2"
                }
                aria-label={t("roomMenu")}
                onCloseAutoFocus={(event) => {
                  if (!feedbackOpening.current) return;
                  event.preventDefault();
                  feedbackOpening.current = false;
                }}
              >
                <div className="mb-1 flex items-start gap-1 px-2">
                  <p className="min-w-0 break-all text-base leading-7">
                    <span className="text-muted-foreground">{t("theme")}</span>
                    <span className="font-medium">
                      {roomName ?? t("unsetTheme")}
                    </span>
                  </p>
                  {!outcomePublished && onRenameRoom ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={t("changeTheme")}
                      title={t("changeTheme")}
                      disabled={isDisconnected || isLeaving || roomNameDisabled}
                      onClick={() => {
                        setRoomMenuOpen(false);
                        onRenameRoom();
                      }}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                {currentMember ? (
                  <MemberSelection
                    name={
                      onEditSelf
                        ? t("renameMember", { name: currentMember.name })
                        : currentMember.name
                    }
                    onSelect={
                      !outcomePublished && onEditSelf
                        ? () => {
                            setRoomMenuOpen(false);
                            onEditSelf();
                          }
                        : undefined
                    }
                    disabled={isDisconnected || isLeaving}
                    className="mb-1 flex w-full min-w-0 items-center gap-2 border-b border-border px-2 pt-1 pb-3 text-left"
                  >
                    <MemberAvatar
                      name={currentMember.name}
                      avatarId={currentMember.avatarId}
                      color={currentMember.color}
                      size={32}
                      isMe
                      isConnected={
                        progress.progressRevision > 0
                          ? progress.connectedUserIds.includes(
                              currentMember.userId,
                            )
                          : undefined
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-base font-medium">
                      {currentMember.name}
                    </span>
                    {onEditSelf && !outcomePublished ? (
                      <Pencil
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                  </MemberSelection>
                ) : null}

                <div className="flex flex-col gap-1">
                  <div className="relative flex h-10 items-center px-2 pr-12 text-base">
                    {t("timerSound")}
                    <TimerSoundControl {...timerSoundControls} />
                  </div>
                  {/* 成果公開後のルームには参加できないため{t("invite")}を出さない。 */}
                  {!outcomePublished ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-10 w-full justify-start gap-3 px-2 font-normal"
                        >
                          <UserPlus aria-hidden="true" className="size-4" />
                          {t("invite")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        ref={inviteContentRef}
                        align="end"
                        className={
                          isPhaseOnePrivateNoteEntry ? "z-[70] w-80" : "w-80"
                        }
                        aria-label={t("inviteToRoom")}
                      >
                        <p className="mb-1 text-base font-semibold">
                          {t("inviteToRoom")}
                        </p>
                        <p className="mb-4 text-xs leading-5 text-muted-foreground">
                          {t("inviteDescription")}
                        </p>

                        <div
                          className="flex flex-col gap-4"
                          data-testid="board-view-invite"
                        >
                          <div className="min-w-0">
                            <span className="block text-xs text-muted-foreground">
                              {t("inviteCode")}
                            </span>
                            <CopyInviteButton
                              value={inviteCode}
                              itemLabel={t("inviteCode")}
                              className="mt-1"
                            />
                          </div>
                          <div className="min-w-0">
                            <InviteUrlActions
                              value={inviteUrl}
                              message={buildInviteMessage({
                                roomName,
                                inviteCode,
                                inviteUrl,
                              })}
                            />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                  {onOpenFeedback ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 w-full justify-start gap-3 px-2 font-normal"
                      onClick={() => {
                        feedbackOpening.current = true;
                        setRoomMenuOpen(false);
                        onOpenFeedback(roomMenuTriggerRef.current);
                      }}
                    >
                      <MessageSquare aria-hidden="true" className="size-4" />
                      {t("feedback")}
                    </Button>
                  ) : null}
                  {rollbackTarget &&
                  onRollbackPhase &&
                  !isNextPhasePending &&
                  !outcomePublished ? (
                    <PhaseRollbackDialog
                      key={`${phaseRevision}:${isDisconnected}:${JSON.stringify(rollbackTarget)}`}
                      phase={phase}
                      target={rollbackTarget}
                      disabled={isDisconnected || isRemovingMember || isLeaving}
                      onConfirm={onRollbackPhase}
                    />
                  ) : null}
                  {outcomePublished ? (
                    <Button
                      variant="ghost"
                      className="h-10 w-full justify-start gap-3 px-2 font-normal"
                      asChild
                    >
                      <Link href="/home">{t("backHome")}</Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 w-full justify-start gap-3 px-2 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={isLeaving || isRemovingMember}
                      data-testid="leave-button"
                      onClick={() => {
                        setRoomMenuOpen(false);
                        onLeaveClick();
                      }}
                    >
                      <DoorOpen className="size-4" aria-hidden="true" />
                      {leaveLabel}
                    </Button>
                  )}
                  {signOutAction ? (
                    <SignOutControl
                      sessionKind={sessionKind}
                      signOutAction={signOutAction}
                      variant="ghost"
                      size="default"
                      className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-2 text-left font-normal"
                      icon={<LogOut className="size-4" aria-hidden="true" />}
                    />
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          </fieldset>
          {!outcomePublished && phase.kind === "step" && !canCompleteSharing ? (
            <RoomTimer
              timer={timer}
              serverOffsetMs={timerServerOffsetMs}
              disabled={
                isDisconnected ||
                transitioning ||
                isRemovingMember ||
                isNextPhasePending
              }
              initialDurationMs={
                activeSharing
                  ? sharingDuration
                  : getRecommendedTimerDurationMs(phase)
              }
              onStart={
                activeSharing?.status === "ready"
                  ? (durationMs) => onSharingStart?.(durationMs)
                  : onTimerStart
              }
              onResume={onTimerResume}
              onExtend={onTimerExtend}
            />
          ) : null}
          {/* 通常の接続案内1行を予約し、同期完了で個人入力を動かさない。 */}
          {connectionStatus !== "open" ||
          (phase.kind === "step" && phase.step === 1) ? (
            <div
              data-testid="board-connection-slot"
              // 幅が狭いと中央上部のステップの並びが右へはみ出すため、接続の案内を前面に出す。
              className={`relative z-[1] ${
                phase.kind === "step" && phase.step === 1
                  ? "min-h-[38px] sm:min-h-0"
                  : ""
              }`}
            >
              <RoomConnectionNotice
                returnHref={loginReturnHref}
                status={connectionStatus}
                testId="board-connection-status"
                className="board-hud pointer-events-auto w-max max-w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground max-[639px]:w-full"
              />
            </div>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
