"use client";

// ボード画面の進行レール・ファシリテーションガイドと操作 HUD。

import { Check, LogOut, MoreHorizontal } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  isPhaseStep,
  isResultStep,
  isVotingStep,
  type RoomPhase,
} from "@/contracts/phase";
import type { SharingState, TimerState } from "@/contracts/room-protocol";
import { CopyInviteButton, InviteUrlActions } from "@/features/invite";
import { MemberAvatar, MemberSelection } from "@/features/room-members";
import { clearLastRoom } from "@/lib/room-client/last-room-storage";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import type { Member } from "../logic/room-reducer";
import { useRoomTimerSounds } from "../logic/use-room-timer-sounds";
import type { StepGuideState } from "../logic/use-step-guide";
import { BoardContext } from "../molecules/board-context";
import { BulkCandidateExclusion } from "../molecules/bulk-candidate-exclusion";
import { NextPhaseConfirmDialog } from "../molecules/next-phase-confirm-dialog";
import { RoomConnectionNotice } from "../molecules/room-connection-notice";
import { SharingAnnouncement } from "../molecules/sharing-announcement";
import { SharingPresenter } from "../molecules/sharing-presenter";
import { StepGuide } from "../molecules/step-guide";
import { RoomTimer } from "./room-timer";

export type RoomBoardHeaderProps = {
  children?: ReactNode;
  hasMoveHistory?: boolean;
  onOpenFeedback?: () => void;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
  inviteCode: string;
  inviteUrl: string;
  phase: RoomPhase;
  phaseRevision?: number;
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
  isNextPhasePending: boolean;
  hostRevision?: number;
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
  onNextPhase: () => void;
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
  inviteCode,
  inviteUrl,
  phase,
  phaseRevision = 0,
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
  isNextPhasePending,
  hostRevision = 0,
  onSelectHostTarget,
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
    }
    updateGuideTop();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateGuideTop);
    observer?.observe(area);
    window.addEventListener("resize", updateGuideTop);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateGuideTop);
      header.style.removeProperty("--board-connection-guide-top");
      board?.style.removeProperty("--board-connection-notice-bottom");
    };
  }, [connectionStatus]);
  const activeSharing =
    phase.kind === "step" && phase.step === 2 ? sharing : null;
  const transitioning = activeSharing?.startsAt != null;
  const presenter =
    activeSharing?.currentIndex != null
      ? activeSharing.order[activeSharing.currentIndex]
      : null;
  const canAdvanceSharing = isHost || presenter?.userId === currentUserId;
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
  useEffect(() => {
    if (!roomMenuOpen) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Node) ||
        roomMenuTriggerRef.current?.contains(target) ||
        roomMenuContentRef.current?.contains(target)
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
  const completedVoterIdSet = new Set(completedVoterIds);
  const haveAllMembersCompletedVoting =
    isCurrentVotingStep &&
    members.length > 0 &&
    members.every(({ userId }) => completedVoterIdSet.has(userId));
  const showVotingCompletion = haveAllMembersCompletedVoting && !isDisconnected;
  const timerSoundControls = useRoomTimerSounds({
    timer,
    serverOffsetMs: timerServerOffsetMs,
    timerUpdateVersion,
    votingCompletion: {
      roundKey:
        isCurrentVotingStep && phase.kind === "step"
          ? `phase-${phase.phase}`
          : null,
      isComplete: haveAllMembersCompletedVoting,
      isDisconnected,
    },
  });
  const guide = getFacilitationGuide(phase);
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

  return (
    <TooltipProvider delayDuration={300}>
      <div
        data-testid="board-header-row"
        className={`pointer-events-none absolute inset-x-3 top-3 bottom-[calc(7.5rem+var(--board-notification-inset,0px))] z-40 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 max-[900px]:grid-cols-[306px_minmax(0,1fr)] max-[639px]:grid-cols-1 max-[639px]:grid-rows-[auto_minmax(0,1fr)] max-[639px]:group-has-[[data-expanded=true]]/board:bottom-[calc(var(--board-private-dock-bottom,7.5rem)+var(--board-private-dock-height,20rem)+0.75rem)] max-[639px]:gap-2 ${hasMoveHistory ? "max-[639px]:bottom-[var(--board-mobile-header-bottom)]" : isHost && phase.kind === "step" && phase.step === 2 ? "max-[639px]:bottom-[calc(16rem+var(--board-notification-inset,0px))]" : "max-[639px]:bottom-[calc(11rem+var(--board-notification-inset,0px))]"}`}
      >
        <div
          className="pointer-events-none flex h-full min-h-0 w-full max-w-[360px] min-w-0 flex-col min-[901px]:max-[1199px]:max-w-[306px] items-start gap-3 max-[900px]:min-w-[306px] max-[639px]:max-w-none max-[639px]:min-w-0 max-[639px]:h-auto max-[639px]:max-h-full max-[639px]:gap-2 max-[639px]:overflow-y-auto max-[639px]:overscroll-contain max-[639px]:pointer-events-auto"
          data-testid="board-context-column"
          data-board-fit-edge="top"
        >
          <div className="w-full min-w-0 shrink-0">
            <BoardContext
              onOpenFeedback={onOpenFeedback}
              phase={phase}
              hmwDecidedIssue={hmwDecidedIssue}
              decidedHmw={decidedHmw}
            />
          </div>
          {transitioning && presenter ? (
            <SharingAnnouncement member={presenter} />
          ) : (
            guide && (
              <StepGuide
                key={`${inviteCode}:${currentUserId}`}
                sessionKey={`${inviteCode}:${currentUserId}`}
                phaseKey={
                  phase.kind === "step"
                    ? `${phase.phase}-${phase.step}`
                    : "lobby"
                }
                guide={guide}
                isHost={isHost}
                isReady={!isDisconnected}
                initialState={initialGuideState}
              />
            )
          )}
          <div className="pointer-events-none flex min-h-0 w-full flex-1 max-[639px]:max-h-[140px] max-[639px]:has-[[data-open=true]]:min-h-[140px] max-[639px]:has-[[data-open=false]]:min-h-9">
            {children}
          </div>
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
            {showVotingCompletion ? (
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
                            isVotingComplete={completedVoterIds.includes(
                              member.userId,
                            )}
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
                          name={member.name}
                          className="flex min-h-11 w-full min-w-0 items-center gap-2 p-1"
                          disabled={hostSelectionDisabled}
                          onSelect={
                            canSelectHost && member.userId !== currentUserId
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
                            isVotingComplete={completedVoterIds.includes(
                              member.userId,
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {member.name}
                          </span>
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

            {activeSharing?.status !== "complete" &&
            (isHost || timer.status !== "idle") ? (
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
                  isHost={isHost}
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
            canAdvanceSharing &&
            activeSharing.status !== "complete" ? (
              activeSharing.status === "ready" ? (
                isHost ? (
                  <Button
                    className="h-10 shrink-0"
                    disabled={isDisconnected || isTransferring}
                    onClick={() => onSharingStart?.(sharingDuration)}
                  >
                    最初の人を開始
                  </Button>
                ) : null
              ) : (
                <>
                  {isHost ? (
                    <Button
                      variant="outline"
                      className="h-10 shrink-0 px-3"
                      disabled={
                        isDisconnected || transitioning || isTransferring
                      }
                      onClick={() => onSharingAdvance?.("passed")}
                    >
                      今回はパス
                    </Button>
                  ) : null}
                  <Button
                    className="h-10 shrink-0 px-3"
                    disabled={isDisconnected || transitioning || isTransferring}
                    onClick={() => onSharingAdvance?.("done")}
                  >
                    次の人へ
                  </Button>
                </>
              )
            ) : null}
            {isHost && !activeSharing ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 px-3 shadow-none"
                  >
                    招待
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-80"
                  aria-label="ルームに招待"
                >
                  <p className="mb-1 text-sm font-semibold">ルームに招待</p>
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

            {isResultStep(phase) ? (
              isFinalStep ? (
                isHost || outcomePublished ? (
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
                        ) : isHost ? (
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
                ) : null
              ) : isHost ? (
                <NextPhaseConfirmDialog
                  key={`${phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"}:${phaseRevision}:${hostRevision}:${isDisconnected}`}
                  phase={phase}
                  disabled={
                    isDisconnected ||
                    isNextPhasePending ||
                    isNextPhaseBlocked ||
                    isTransferring
                  }
                  onConfirm={onNextPhase}
                />
              ) : null
            ) : isHost &&
              (!activeSharing || activeSharing.status === "complete") ? (
              <NextPhaseConfirmDialog
                key={`${phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"}:${phaseRevision}:${hostRevision}:${isDisconnected}`}
                phase={phase}
                disabled={
                  isDisconnected ||
                  isNextPhasePending ||
                  isNextPhaseBlocked ||
                  isTransferring
                }
                onConfirm={onNextPhase}
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
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                ref={roomMenuContentRef}
                className="w-80"
                aria-label="ルームメニュー"
              >
                {currentMember ? (
                  <div className="mb-3 flex min-w-0 items-center gap-2 border-b border-border pb-3">
                    <MemberAvatar
                      name={currentMember.name}
                      color={currentMember.color}
                      size={32}
                      isMe
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {currentMember.name}
                    </span>
                    {isHost ? (
                      <span className="text-xs text-muted-foreground">
                        ホスト
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-1">
                  {isHost && canManageCandidates ? (
                    <BulkCandidateExclusion
                      key={hostRevision}
                      targetCount={bulkExclusionTargetCount}
                      disabled={isDisconnected || isTransferring}
                      onConfirm={onBulkCandidateExclude}
                    />
                  ) : null}
                  {isHost &&
                  activeSharing &&
                  activeSharing.status !== "complete" ? (
                    <NextPhaseConfirmDialog
                      key={`${phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"}:${phaseRevision}:${hostRevision}:${isDisconnected}`}
                      phase={phase}
                      disabled={
                        isDisconnected ||
                        isNextPhasePending ||
                        isNextPhaseBlocked ||
                        isTransferring
                      }
                      onConfirm={onNextPhase}
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-10 justify-start"
                    disabled={isLeaving || isTransferring}
                    data-testid="leave-button"
                    onClick={() => {
                      setRoomMenuOpen(false);
                      onLeaveClick();
                    }}
                  >
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
                        className="h-10 w-full justify-start"
                      >
                        <LogOut aria-hidden="true" />
                        ログアウト
                      </Button>
                    </form>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          </fieldset>
          <RoomConnectionNotice
            status={connectionStatus}
            delayed={connectionDelayed}
            testId="board-connection-status"
            className="board-hud pointer-events-auto w-max max-w-full rounded-xl border border-border bg-background px-4 py-2 text-sm text-muted-foreground max-[639px]:w-full"
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
