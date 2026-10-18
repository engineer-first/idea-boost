"use client";

// ボード画面の進行レール・ファシリテーションガイドと操作 HUD。

import {
  Check,
  DoorOpen,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  isPersonalWritingStep,
  isPhaseStep,
  isResultStep,
  isVotingStep,
  type RoomPhase,
  VOTING_STEP_BY_PHASE,
} from "@/contracts/phase";
import type {
  Carryover,
  SharingState,
  TimerState,
} from "@/contracts/room-protocol";
import { CopyInviteButton, InviteUrlActions } from "@/features/invite";
import {
  MemberAvatar,
  MemberSelection,
  NOTE_COLOR_NAMES,
} from "@/features/room-members";
import { clearLastRoom } from "@/lib/room-client/last-room-storage";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import { isFixedIdeaMapStep } from "../logic/idea-value-feasibility-map";
import type { Member, PhaseProgressState } from "../logic/room-reducer";
import { useRoomTimerSounds } from "../logic/use-room-timer-sounds";
import type { StepGuideState } from "../logic/use-step-guide";
import { BoardContext } from "../molecules/board-context";
import { BulkCandidateExclusion } from "../molecules/bulk-candidate-exclusion";
import { NextPhaseConfirmDialog } from "../molecules/next-phase-confirm-dialog";
import { PhaseRollbackDialog } from "../molecules/phase-rollback-dialog";
import { RoomConnectionNotice } from "../molecules/room-connection-notice";
import { SharingAnnouncement } from "../molecules/sharing-announcement";
import { SharingPresenter } from "../molecules/sharing-presenter";
import { StepGuide } from "../molecules/step-guide";
import { RoomTimer } from "./room-timer";

const MAP_WORKSPACE_CONTEXT_GAP = 18;

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
  rollbackTarget?: RoomPhase | null;
  onRollbackPhase?: () => void;
  bulkExclusionTargetCount?: number;
  canManageCandidates?: boolean;
  onBulkCandidateExclude?: () => void;
  sharing?: SharingState | null;
  onSharingStart?: (durationMs: number) => void;
  onSharingAdvance?: (outcome: "done" | "passed") => void;
  timer: TimerState;
  timerServerOffsetMs: number;
  timerUpdateVersion?: number;
  isHost: boolean;
  // ハイドレーション対策込みの「操作を止めるべきか」。判定は view の責務。
  isDisconnected: boolean;
  connectionStatus: RoomScreenConnectionStatus;
  connectionDelayed?: boolean;
  members: Member[];
  currentUserId: string;
  hostUserId: string;
  completedVoterIds?: ReadonlyArray<string>;
  progress?: PhaseProgressState;
  onToggleReady?: (ready: boolean) => void;
  isNextPhasePending: boolean;
  hostRevision?: number;
  onEditSelf?: () => void;
  roomName?: string | null;
  onRenameRoom?: () => void;
  roomNameDisabled?: boolean;
  onSelectHostTarget?: (userId: string) => void;
  isTransferring?: boolean;
  // 「次のステップへ」を進められない状態（決定待ち・次ステップ未実装など）。
  // 判定は view の責務で、ここでは受け取った状態で無効化するだけ。
  isNextPhaseBlocked: boolean;
  initialGuideState?: StepGuideState;
  hasFinalDecision: boolean;
  outcomePublished: boolean;
  isLeaving: boolean;
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
  rollbackTarget = null,
  onRollbackPhase,
  bulkExclusionTargetCount = 0,
  canManageCandidates = false,
  onBulkCandidateExclude = () => undefined,
  sharing = null,
  onSharingStart,
  onSharingAdvance,
  timer,
  timerServerOffsetMs,
  timerUpdateVersion = 0,
  isHost,
  isDisconnected,
  connectionStatus,
  connectionDelayed = false,
  members,
  currentUserId,
  hostUserId,
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
  isNextPhasePending,
  hostRevision = 0,
  onSelectHostTarget,
  onEditSelf,
  roomName,
  onRenameRoom,
  roomNameDisabled,
  isTransferring = false,
  isNextPhaseBlocked,
  initialGuideState,
  hasFinalDecision,
  outcomePublished,
  isLeaving,
  signOutAction,
  onShowOutcome,
  onPublishOutcome,
  onLeaveClick,
  onNextPhase,
  onTimerStart,
  onTimerPause,
  onTimerResume,
  onTimerExtend,
  onTimerStop,
}: RoomBoardHeaderProps) {
  const controlsAreaRef = useRef<HTMLDivElement>(null);
  const isMapWorkspace = isPhaseStep(phase, 3, 2) || isPhaseStep(phase, 3, 3);
  const isFixedIdeaMap = isFixedIdeaMapStep(phase);
  useEffect(() => {
    const area = controlsAreaRef.current;
    const header = area?.closest<HTMLElement>(
      '[data-testid="board-header-row"]',
    );
    const board = header?.closest<HTMLElement>(
      '[data-testid="room-board-view-root"]',
    );
    if (!area || !header) return;
    function updateGuideTop(): void {
      const notice =
        connectionStatus === "open"
          ? null
          : area?.querySelector<HTMLElement>(
              '[data-testid="board-connection-status"]',
            );
      if (!header) return;
      if (isFixedIdeaMap && board) {
        const boardTop = board.getBoundingClientRect().top;
        const location = header.querySelector<HTMLElement>(
          '[data-testid="board-location-card"]',
        );
        const guide = header.querySelector<HTMLElement>(
          '[data-testid="step-guide"]',
        );
        const helpToggle = isMapWorkspace
          ? header
              .querySelector<HTMLElement>('[data-testid="board-help-panel"]')
              ?.querySelector<HTMLElement>("[data-help-toggle]")
          : null;
        const contextColumn = header.querySelector<HTMLElement>(
          '[data-testid="board-context-column"]',
        );
        const compactGuideBottom =
          (guide?.getBoundingClientRect().top ?? boardTop) + 42;
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
              ? Math.max(
                  ...(isFixedIdeaMap ? [] : [compactGuideBottom]),
                  locationBottom,
                  controlsBottom,
                  helpRowBottom,
                ) -
                boardTop +
                25
              : compactGuideBottom - boardTop + 24;
        // 投票完了表示用のモバイル余白は周辺UIに残し、マップ位置には足さない。
        const votingStatusPadding =
          !isMapWorkspace && window.innerWidth <= 639 && area
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
              context.getBoundingClientRect().bottom +
              MAP_WORKSPACE_CONTEXT_GAP;
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
      } else {
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
    updateGuideTop();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateGuideTop);
    observer?.observe(area);
    if (isFixedIdeaMap) observer?.observe(header);
    const location = header.querySelector<HTMLElement>(
      '[data-testid="board-location-card"]',
    );
    if (location?.parentElement) observer?.observe(location.parentElement);
    window.addEventListener("resize", updateGuideTop);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateGuideTop);
      header.style.removeProperty("--board-connection-guide-top");
      header.style.removeProperty("--board-location-top");
      header.style.removeProperty("--board-location-height");
      board?.style.removeProperty("--board-connection-notice-bottom");
      board?.style.removeProperty("--board-map-top");
      board?.style.removeProperty("--board-map-shift-y");
      board?.style.removeProperty("--board-map-tray-top");
    };
  }, [connectionStatus, isMapWorkspace, isFixedIdeaMap]);
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
  const [configuredDuration, setConfiguredDuration] = useState<{
    revision: string;
    durationMs: number;
  } | null>(null);
  const sharingDuration =
    activeSharing?.status === "ready" &&
    configuredDuration?.revision === activeSharing.revision
      ? configuredDuration.durationMs
      : (activeSharing?.durationMs ?? 180000);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const canSelectHost = isHost && !outcomePublished && onSelectHostTarget;
  const hostSelectionDisabled =
    isDisconnected || isNextPhasePending || isTransferring || isLeaving;
  const roomMenuTriggerRef = useRef<HTMLButtonElement>(null);
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
  const isManualProgressStep =
    isPersonalWritingStep(phase) ||
    (phase.kind === "step" &&
      ((phase.phase === 1 && phase.step === 3) ||
        (phase.phase === 3 && phase.step === 3)));
  const isCurrentUserReady = progress.readyUserIds.includes(currentUserId);
  const notReadyNames = members
    .filter((member) => progress.notReadyUserIds.includes(member.userId))
    .map((member) => member.name);
  const notReadyMembers = members.filter((member) =>
    progress.notReadyUserIds.includes(member.userId),
  );
  const requireProgressConfirmation =
    ((isManualProgressStep || isCurrentVotingStep) && !progress.allReady) ||
    (phase.kind === "step" &&
      phase.step === VOTING_STEP_BY_PHASE[phase.phase] - 1) ||
    isResultStep(phase);
  const showVotingCompletion =
    isCurrentVotingStep &&
    members.length > 0 &&
    progress.connectedUserIds.length > 0 &&
    progress.allReady &&
    !isDisconnected;
  const completedMemberIds = isCurrentVotingStep
    ? completedVoterIds
    : isManualProgressStep
      ? progress.readyUserIds
      : [];
  const completionLabel = isCurrentVotingStep ? "投票完了" : "作業完了";
  const timerSoundControls = useRoomTimerSounds({
    timer,
    serverOffsetMs: timerServerOffsetMs,
    timerUpdateVersion,
    votingCompletion: {
      roundKey:
        isCurrentVotingStep && phase.kind === "step"
          ? `phase-${phase.phase}`
          : null,
      isComplete: isCurrentVotingStep && progress.allReady,
      isDisconnected,
    },
  });
  const guide = getFacilitationGuide(phase);
  const isPhaseThreePrivateNoteEntry =
    phase.kind === "step" && phase.phase === 3 && phase.step === 1;
  const isFinalStep = isPhaseStep(phase, 3, 5);
  const currentMember = members.find(
    (member) => member.userId === currentUserId,
  );
  const leaveLabel =
    isHost && !outcomePublished
      ? isLeaving
        ? "解散中…"
        : "ルームを解散"
      : isLeaving
        ? "退出中…"
        : "退出する";

  const stepGuide =
    transitioning && presenter ? (
      <SharingAnnouncement member={presenter} />
    ) : guide ? (
      <StepGuide
        key={`${inviteCode}:${currentUserId}`}
        sessionKey={`${inviteCode}:${currentUserId}`}
        placement={isMapWorkspace ? "floating" : undefined}
        phaseKey={
          phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"
        }
        guide={guide}
        isHost={isHost}
        isReady={!isDisconnected}
        timer={timer}
        initialState={initialGuideState}
      />
    ) : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-testid="board-header-row"
        data-map-workspace={isMapWorkspace || undefined}
        className={`pointer-events-none absolute inset-x-3 top-3 bottom-[7.5rem] z-40 max-[639px]:z-[41] has-[[data-location-open=true]]:z-[60] grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 max-[900px]:grid-cols-[306px_minmax(0,1fr)] max-[639px]:grid-cols-1 max-[639px]:grid-rows-[auto_minmax(0,1fr)] max-[639px]:group-has-[[data-expanded=true]]/board:bottom-[calc(var(--board-private-dock-bottom,7.5rem)+var(--board-private-dock-height,20rem)+0.75rem)] max-[639px]:gap-2 ${isPhaseThreePrivateNoteEntry ? "min-[640px]:bottom-3" : ""} ${hasMoveHistory ? "max-[639px]:bottom-[var(--board-mobile-header-bottom)]" : isHost && phase.kind === "step" && phase.step === 2 ? "max-[639px]:bottom-[16rem]" : "max-[639px]:bottom-[11rem]"}`}
      >
        <div
          className="pointer-events-none flex h-full w-full max-w-[360px] min-h-0 min-w-0 flex-col items-start gap-3 min-[900px]:max-[1200px]:max-w-[306px] max-[900px]:min-w-[306px] max-[639px]:relative max-[639px]:grid max-[639px]:grid-cols-[200px_minmax(0,1fr)] max-[639px]:grid-rows-[calc(var(--board-location-height,80px)+50px)_auto] max-[639px]:items-start max-[639px]:max-w-none max-[639px]:min-w-0 max-[639px]:h-auto max-[639px]:max-h-full max-[639px]:gap-2 max-[639px]:overflow-y-auto max-[639px]:has-[[data-location-open=true]]:overflow-visible max-[639px]:overscroll-contain max-[639px]:pointer-events-auto"
          data-testid="board-context-column"
          data-board-fit-edge="top"
        >
          <div className="w-full min-w-0 shrink-0 max-[640px]:max-w-[306px] max-[639px]:col-start-1 max-[639px]:row-start-1 max-[639px]:row-span-2 max-[639px]:w-[min(306px,calc(100vw-24px))]">
            <BoardContext
              initialDisclosureId={isFixedIdeaMap ? null : undefined}
              phase={phase}
              outcomePublished={outcomePublished}
              hmwDecidedIssue={hmwDecidedIssue}
              decidedHmw={decidedHmw}
              issueReference={issueReference}
              hmwReference={hmwReference}
            />
          </div>
          {stepGuide}
          {!isMapWorkspace || (children !== null && children !== undefined) ? (
            <div
              className="pointer-events-none flex min-h-0 w-full flex-1 max-[639px]:col-start-2 max-[639px]:row-start-2 max-[639px]:max-h-[140px] max-[639px]:has-[[data-open=true]]:min-h-[140px] max-[639px]:has-[[data-open=false]]:min-h-9"
              data-testid="board-help-slot"
            >
              {children}
            </div>
          ) : null}
        </div>

        {/* 狭幅の完了表示は操作行の外へ置く。結果でも同じ縦余白を保ち、現在地表示を動かさない。 */}
        <div
          ref={controlsAreaRef}
          className={`pointer-events-none flex min-w-0 flex-col items-end gap-2 max-[900px]:max-w-[426px] max-[639px]:order-first max-[639px]:w-full ${isCurrentVotingStep || isResultStep(phase) ? "max-[900px]:pb-6" : ""}`}
        >
          <fieldset
            className="board-hud pointer-events-auto relative flex h-14 min-w-0 shrink-0 items-center justify-end gap-1 rounded-2xl border border-border bg-background p-1.5 shadow-lg shadow-black/5 max-[900px]:h-auto max-[900px]:max-w-[426px] max-[900px]:flex-wrap max-[639px]:order-first max-[639px]:w-full max-[639px]:justify-start max-[639px]:gap-0 max-[639px]:p-1 max-[639px]:[&>button]:px-2"
            aria-label="ルームの操作"
            data-testid="board-control-hud"
            data-board-fit-edge="top"
          >
            {isManualProgressStep && onToggleReady ? (
              <Button
                type="button"
                variant={isCurrentUserReady ? "secondary" : "outline"}
                className="h-10 shrink-0 px-3"
                disabled={isDisconnected || isNextPhasePending}
                aria-pressed={isCurrentUserReady}
                onClick={() => onToggleReady(!isCurrentUserReady)}
              >
                {isCurrentUserReady ? "完了を取り消す" : "完了"}
              </Button>
            ) : showVotingCompletion ? (
              <span
                className="shrink-0 max-[900px]:absolute max-[900px]:right-0 max-[900px]:top-full max-[900px]:mt-1 max-[900px]:rounded-md max-[900px]:bg-background max-[900px]:px-2"
                data-testid="vote-completion-indicator"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex max-w-20 items-center gap-1 overflow-hidden whitespace-nowrap text-xs font-semibold text-emerald-700 opacity-100 transition-[max-width,opacity] duration-[120ms] starting:max-w-0 starting:opacity-0 motion-reduce:transition-none"
                  data-testid="vote-completion-label"
                >
                  <Check className="size-3.5 shrink-0" />
                  全員OK
                </span>
                <span className="sr-only" role="status" aria-live="polite">
                  全員の投票が完了しました
                </span>
              </span>
            ) : null}
            {activeSharing ? (
              <SharingPresenter
                onEditSelf={outcomePublished ? undefined : onEditSelf}
                sharing={activeSharing}
                hostUserId={hostUserId}
                currentUserId={currentUserId}
                onSelectHostTarget={
                  canSelectHost ? onSelectHostTarget : undefined
                }
                selectionDisabled={hostSelectionDisabled}
                members={members}
              />
            ) : (
              <Popover open={membersOpen} onOpenChange={setMembersOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 gap-2 px-2 max-[900px]:w-[52px] max-[900px]:gap-0 max-[900px]:px-0"
                    aria-label={`参加者 ${members.length}人`}
                    data-host-transfer-origin
                    title="参加者一覧を開く"
                  >
                    <span
                      className="flex items-center pl-2 max-[900px]:pl-0"
                      aria-hidden="true"
                    >
                      {members.slice(0, 10).map((member, index) => (
                        <span
                          key={member.userId}
                          className={`relative ${
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
                            color={member.color}
                            size={28}
                            isMe={member.userId === currentUserId}
                            isVotingComplete={completedMemberIds.includes(
                              member.userId,
                            )}
                            completionLabel={completionLabel}
                          />
                        </span>
                      ))}
                      <span
                        data-testid="member-overflow-indicator"
                        className={`relative z-20 -ml-1 size-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-semibold tabular-nums text-foreground ${
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
                <PopoverContent className="w-72" aria-label="参加者一覧">
                  <p className="mb-3 text-sm font-semibold">
                    参加者 {members.length}人
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
                              ? `${member.name}：表示名を変更`
                              : member.name
                          }
                          className="flex min-h-11 w-full min-w-0 items-center gap-2 p-1"
                          disabled={hostSelectionDisabled}
                          onSelect={
                            member.userId === currentUserId &&
                            onEditSelf &&
                            !outcomePublished
                              ? () => {
                                  setMembersOpen(false);
                                  onEditSelf();
                                }
                              : canSelectHost && member.userId !== currentUserId
                                ? () => {
                                    setMembersOpen(false);
                                    onSelectHostTarget?.(member.userId);
                                  }
                                : undefined
                          }
                        >
                          <MemberAvatar
                            name={member.name}
                            color={member.color}
                            size={32}
                            isMe={member.userId === currentUserId}
                            isVotingComplete={completedMemberIds.includes(
                              member.userId,
                            )}
                            completionLabel={completionLabel}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
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
                          {member.userId === hostUserId ? (
                            <span
                              className="text-xs text-muted-foreground"
                              data-testid={`member-host-label-${member.userId}`}
                            >
                              ホスト
                            </span>
                          ) : null}
                          {member.userId === currentUserId ? (
                            <span className="text-xs text-muted-foreground">
                              あなた
                            </span>
                          ) : null}
                        </MemberSelection>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            )}

            {activeSharing?.status !== "complete" && timer.status !== "idle" ? (
              <span
                aria-hidden="true"
                className="mx-1 h-6 w-px shrink-0 bg-border"
              />
            ) : null}
            {activeSharing?.status !== "complete" && (
              <div className="pointer-events-auto shrink-0">
                <RoomTimer
                  key={
                    phase.kind === "step"
                      ? `${phase.phase}-${phase.step}:${hostRevision}`
                      : `lobby:${hostRevision}`
                  }
                  timer={timer}
                  serverOffsetMs={timerServerOffsetMs}
                  soundControls={timerSoundControls}
                  isHost
                  disabled={isDisconnected || transitioning || isTransferring}
                  configureOnly={activeSharing?.status === "ready"}
                  onConfigureDuration={(durationMs) => {
                    if (activeSharing)
                      setConfiguredDuration({
                        revision: activeSharing.revision,
                        durationMs,
                      });
                  }}
                  initialDurationMs={
                    activeSharing
                      ? sharingDuration
                      : (guide?.durationMinutes ?? 3) * 60_000
                  }
                  onStart={onTimerStart}
                  onPause={onTimerPause}
                  onResume={onTimerResume}
                  onExtend={onTimerExtend}
                  onStop={onTimerStop}
                />
              </div>
            )}
            {activeSharing &&
            activeSharing.status !== "complete" &&
            (activeSharing.status === "ready"
              ? canStartSharing
              : canAdvanceSharing) ? (
              activeSharing.status === "ready" ? (
                <Button
                  className="h-10 shrink-0"
                  disabled={isDisconnected || isTransferring}
                  onClick={() => onSharingStart?.(sharingDuration)}
                >
                  最初の人を開始
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="h-10 shrink-0 px-3"
                    disabled={isDisconnected || transitioning || isTransferring}
                    onClick={() => onSharingAdvance?.("passed")}
                  >
                    今回はパス
                  </Button>
                  <Button
                    className="h-10 shrink-0 px-3"
                    data-testid="sharing-advance"
                    disabled={isDisconnected || transitioning || isTransferring}
                    onClick={() => onSharingAdvance?.("done")}
                  >
                    {isLastPresenter ? "次のステップへ" : "次の人へ"}
                  </Button>
                </>
              )
            ) : null}
            {isResultStep(phase) ? (
              isFinalStep ? (
                <div className="grid shrink-0 items-center justify-items-end">
                  <span
                    aria-hidden="true"
                    className="invisible col-start-1 row-start-1 inline-flex h-10 items-center rounded-lg border border-transparent px-4 text-sm font-medium whitespace-nowrap max-[900px]:px-2 max-[900px]:text-xs"
                  >
                    次のステップへ
                  </span>
                  <div className="col-start-1 row-start-1">
                    {hasFinalDecision ? (
                      outcomePublished ? (
                        <Button
                          type="button"
                          className="h-10 shrink-0 px-3"
                          onClick={onShowOutcome}
                        >
                          成果を見る
                        </Button>
                      ) : !outcomePublished ? (
                        <Button
                          type="button"
                          size="icon"
                          className="size-10 shrink-0"
                          aria-label="完了して成果を表示"
                          title="完了して成果を表示"
                          disabled={isDisconnected || isTransferring}
                          onClick={onPublishOutcome}
                        >
                          <Check aria-hidden="true" className="size-5" />
                        </Button>
                      ) : null
                    ) : null}
                  </div>
                </div>
              ) : !isFinalStep ? (
                <NextPhaseConfirmDialog
                  key={`${phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"}:${phaseRevision}:${hostRevision}:${isDisconnected}`}
                  phase={phase}
                  disabled={
                    isDisconnected ||
                    isNextPhasePending ||
                    isNextPhaseBlocked ||
                    isTransferring
                  }
                  requireConfirmation={requireProgressConfirmation}
                  notReadyNames={notReadyNames}
                  notReadyMembers={notReadyMembers}
                  onConfirm={() =>
                    onNextPhase(
                      progress.allReady ? undefined : progress.progressRevision,
                    )
                  }
                />
              ) : null
            ) : !activeSharing ||
              (activeSharing.status === "complete" && canCompleteSharing) ? (
              <NextPhaseConfirmDialog
                key={`${phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"}:${phaseRevision}:${hostRevision}:${isDisconnected}`}
                phase={phase}
                disabled={
                  isDisconnected ||
                  isNextPhasePending ||
                  isNextPhaseBlocked ||
                  ((isManualProgressStep || isCurrentVotingStep) &&
                    !progress.canAdvance) ||
                  isTransferring
                }
                requireConfirmation={requireProgressConfirmation}
                notReadyNames={notReadyNames}
                notReadyMembers={notReadyMembers}
                onConfirm={() =>
                  onNextPhase(
                    progress.allReady ? undefined : progress.progressRevision,
                  )
                }
              />
            ) : null}

            <Popover open={roomMenuOpen} onOpenChange={setRoomMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-8 shrink-0 p-0"
                  aria-label="ルームメニューを開く"
                  ref={roomMenuTriggerRef}
                  data-testid="room-menu-trigger"
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                ref={roomMenuContentRef}
                className="w-80 p-2"
                aria-label="ルームメニュー"
                onCloseAutoFocus={(event) => {
                  if (!feedbackOpening.current) return;
                  event.preventDefault();
                  feedbackOpening.current = false;
                }}
              >
                <div className="mb-1 flex items-start gap-1 px-2">
                  <p className="min-w-0 break-all text-sm leading-7">
                    <span className="text-muted-foreground">ルーム名：</span>
                    <span className="font-medium">{roomName ?? "未設定"}</span>
                  </p>
                  {!outcomePublished && onRenameRoom ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="ルーム名を変更"
                      title="ルーム名を変更"
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
                        ? `${currentMember.name}：表示名を変更`
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
                      color={currentMember.color}
                      size={32}
                      isMe
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {currentMember.name}
                    </span>
                    {onEditSelf && !outcomePublished ? (
                      <Pencil
                        className="size-3 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                    {isHost ? (
                      <span className="text-xs text-muted-foreground">
                        ホスト
                      </span>
                    ) : null}
                  </MemberSelection>
                ) : null}

                <div className="flex flex-col gap-1">
                  {isHost && !activeSharing ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-10 w-full justify-start gap-3 px-2 font-normal"
                        >
                          <UserPlus aria-hidden="true" className="size-4" />
                          招待
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        ref={inviteContentRef}
                        align="end"
                        className="w-80"
                        aria-label="ルームに招待"
                      >
                        <p className="mb-1 text-sm font-semibold">
                          ルームに招待
                        </p>
                        <p className="mb-4 text-xs leading-5 text-muted-foreground">
                          リンクまたはコードを送って、参加してもらいましょう。
                        </p>

                        <div
                          className="flex flex-col gap-4"
                          data-testid="board-view-invite"
                        >
                          <div className="min-w-0">
                            <span className="block text-xs text-muted-foreground">
                              招待URL
                            </span>
                            <InviteUrlActions value={inviteUrl} />
                          </div>
                          <div className="min-w-0">
                            <span className="block text-xs text-muted-foreground">
                              招待コード
                            </span>
                            <CopyInviteButton
                              value={inviteCode}
                              itemLabel="招待コード"
                              className="mt-1"
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
                      フィードバック
                    </Button>
                  ) : null}
                  {rollbackTarget &&
                  onRollbackPhase &&
                  !isNextPhasePending &&
                  !outcomePublished ? (
                    <PhaseRollbackDialog
                      key={`${phaseRevision}:${hostRevision}:${isDisconnected}:${JSON.stringify(rollbackTarget)}`}
                      phase={phase}
                      target={rollbackTarget}
                      disabled={isDisconnected || isTransferring || isLeaving}
                      onConfirm={onRollbackPhase}
                    />
                  ) : null}
                  {canManageCandidates ? (
                    <BulkCandidateExclusion
                      key={hostRevision}
                      targetCount={bulkExclusionTargetCount}
                      disabled={isDisconnected || isTransferring}
                      onConfirm={onBulkCandidateExclude}
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-full justify-start gap-3 px-2 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isLeaving || isTransferring}
                    data-testid="leave-button"
                    onClick={() => {
                      setRoomMenuOpen(false);
                      onLeaveClick();
                    }}
                  >
                    {isHost ? (
                      <Trash2 className="size-4" aria-hidden="true" />
                    ) : (
                      <DoorOpen className="size-4" aria-hidden="true" />
                    )}
                    {leaveLabel}
                  </Button>
                  {signOutAction ? (
                    <form
                      action={signOutAction}
                      onSubmit={() => clearLastRoom()}
                    >
                      <Button
                        type="submit"
                        variant="ghost"
                        className="h-10 w-full justify-start gap-3 px-2 font-normal"
                      >
                        <LogOut className="size-4" aria-hidden="true" />
                        ログアウト
                      </Button>
                    </form>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          </fieldset>
          {/* 通常の接続案内1行を予約し、同期完了で個人入力を動かさない。 */}
          {connectionStatus !== "open" ||
          (phase.kind === "step" && phase.step === 1) ? (
            <div
              data-testid="board-connection-slot"
              className={
                phase.kind === "step" && phase.step === 1
                  ? "min-h-[38px] sm:min-h-0"
                  : undefined
              }
            >
              <RoomConnectionNotice
                returnHref={loginReturnHref}
                status={connectionStatus}
                delayed={connectionDelayed}
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
