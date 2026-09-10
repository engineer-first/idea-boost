"use client";

// ボード画面の進行レール・ファシリテーションガイドと操作 HUD。
import { Check, ChevronUp, LogOut, MoreHorizontal } from "lucide-react";
import { useState } from "react";
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
  PHASE_STEP_COUNTS,
  type RoomPhase,
} from "@/contracts/phase";
import type { TimerState } from "@/contracts/room-protocol";
import type { DotVoteRemaining } from "@/features/dot-vote";
import { DotVoteSummary } from "@/features/dot-vote";
import { CopyInviteButton } from "@/features/invite";
import { MemberAvatar } from "@/features/room-members";
import {
  CONNECTION_STATUS_LABELS,
  type RoomScreenConnectionStatus,
} from "../logic/connection-status";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import { getPhaseLabel } from "../logic/phase-labels";
import type { Member } from "../logic/room-reducer";
import { FacilitationGuide } from "../molecules/facilitation-guide";
import { NextPhaseConfirmDialog } from "../molecules/next-phase-confirm-dialog";
import { RoomTimer } from "./room-timer";

const PHASE_TITLES = {
  1: "課題整理",
  2: "問いの作成",
  3: "アイデア",
} as const;

const PROGRESS_STEPS = [1, 2, 3, 4, 5] as const;

export type RoomBoardHeaderProps = {
  inviteCode: string;
  inviteUrl: string;
  phase: RoomPhase;
  timer: TimerState;
  timerServerOffsetMs: number;
  isHost: boolean;
  // ハイドレーション対策込みの「操作を止めるべきか」。判定は view の責務。
  isDisconnected: boolean;
  connectionStatus: RoomScreenConnectionStatus;
  members: Member[];
  currentUserId: string;
  hostUserId: string;
  isNextPhasePending: boolean;
  // 「次のステップへ」を進められない状態（決定待ち・次ステップ未実装など）。
  // 判定は view の責務で、ここでは受け取った状態で無効化するだけ。
  isNextPhaseBlocked: boolean;
  isGuideExpanded: boolean;
  isSprintComplete: boolean;
  voteRemaining: DotVoteRemaining;
  isLeaving: boolean;
  signOutAction?: () => Promise<void>;
  onShowVoteResult: () => void;
  onGuideExpandedChange: (isExpanded: boolean) => void;
  onLeaveClick: () => void;
  onNextPhase: () => void;
  onTimerStart: (durationMs: number) => void;
  onTimerPause: () => void;
  onTimerResume: () => void;
  onTimerExtend: () => void;
  onTimerStop: () => void;
};

function getPhaseContext(phase: RoomPhase): {
  phaseLabel: string | null;
  title: string;
  step: number;
  stepCount: number;
  stepLabel: string;
} {
  if (phase.kind === "lobby") {
    return {
      phaseLabel: null,
      title: "開始待ち",
      step: 0,
      stepCount: 1,
      stepLabel: "準備中",
    };
  }

  return {
    phaseLabel: `フェーズ${phase.phase}`,
    title: PHASE_TITLES[phase.phase],
    step: phase.step,
    stepCount: PHASE_STEP_COUNTS[phase.phase],
    stepLabel: getPhaseLabel(phase).replace(/^\d+-\d+\s*/, ""),
  };
}

export function RoomBoardHeader({
  inviteCode,
  inviteUrl,
  phase,
  timer,
  timerServerOffsetMs,
  isHost,
  isDisconnected,
  connectionStatus,
  members,
  currentUserId,
  hostUserId,
  isNextPhasePending,
  isNextPhaseBlocked,
  isGuideExpanded,
  isSprintComplete,
  voteRemaining,
  isLeaving,
  signOutAction,
  onShowVoteResult,
  onGuideExpandedChange,
  onLeaveClick,
  onNextPhase,
  onTimerStart,
  onTimerPause,
  onTimerResume,
  onTimerExtend,
  onTimerStop,
}: RoomBoardHeaderProps) {
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const context = getPhaseContext(phase);
  const guide = getFacilitationGuide(phase);
  const isFinalStep = isPhaseStep(phase, 3, 5);
  const currentMember = members.find(
    (member) => member.userId === currentUserId,
  );
  const connectionLabel = CONNECTION_STATUS_LABELS[connectionStatus];
  const leaveLabel = isHost
    ? isLeaving
      ? "解散中…"
      : "ルームを解散"
    : isLeaving
      ? "退出中…"
      : "退出する";

  return (
    <TooltipProvider delayDuration={300}>
      <header
        className={`facilitation-guide-material pointer-events-auto absolute top-3 left-3 z-40 overflow-hidden rounded-xl border border-border bg-background/85 shadow-lg shadow-black/5 backdrop-blur-xl ${
          guide === null
            ? "max-w-[calc(100%-34rem)]"
            : "w-[min(40rem,calc(100%-34rem))]"
        }`}
        data-testid="board-context-hud"
      >
        <div className="flex h-12 items-center gap-3 px-3">
          <p className="shrink-0 text-sm font-semibold tracking-tight">
            Idea Boost
          </p>
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          {context.phaseLabel !== null ? (
            <p className="shrink-0 text-xs font-semibold text-muted-foreground">
              {context.phaseLabel}
            </p>
          ) : null}
          <p className="shrink-0 text-xs font-semibold">{context.title}</p>
          <p className="flex min-w-0 flex-1 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
            <span className="shrink-0 font-medium text-foreground">
              Step {context.step}/{context.stepCount}
            </span>
            <span className="min-w-0 truncate">{context.stepLabel}</span>
          </p>
          <div
            role="progressbar"
            aria-label={`${context.title}の進行状況`}
            aria-valuemin={0}
            aria-valuemax={context.stepCount}
            aria-valuenow={context.step}
            className="flex h-1 w-24 min-w-16 shrink gap-1 sm:w-32"
            data-testid="board-progress-rail"
          >
            {PROGRESS_STEPS.slice(0, context.stepCount).map((stepNumber) => (
              <span
                key={stepNumber}
                className={`h-full flex-1 rounded-full ${
                  stepNumber <= context.step ? "bg-foreground" : "bg-muted"
                }`}
              />
            ))}
          </div>
          {guide !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-full"
              aria-label={`ファシリテーションガイドを${
                isGuideExpanded ? "折り畳む" : "展開する"
              }`}
              aria-expanded={isGuideExpanded}
              aria-controls="facilitation-guide-content"
              onClick={() => onGuideExpandedChange(!isGuideExpanded)}
            >
              <ChevronUp
                aria-hidden="true"
                className={`transition-transform duration-200 ease-out motion-reduce:duration-100 ${
                  isGuideExpanded ? "rotate-0" : "rotate-180"
                }`}
              />
            </Button>
          ) : null}
        </div>
        {guide !== null ? (
          <FacilitationGuide
            id="facilitation-guide-content"
            guide={guide}
            isHost={isHost}
            isExpanded={isGuideExpanded}
          />
        ) : null}
      </header>

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-end gap-2 p-3"
        data-testid="board-control-hud"
      >
        <div className="pointer-events-auto shrink-0">
          <RoomTimer
            key={
              phase.kind === "step" ? `${phase.phase}-${phase.step}` : "lobby"
            }
            timer={timer}
            serverOffsetMs={timerServerOffsetMs}
            isHost={isHost}
            disabled={isDisconnected}
            initialDurationMs={(guide?.durationMinutes ?? 3) * 60_000}
            onStart={onTimerStart}
            onPause={onTimerPause}
            onResume={onTimerResume}
            onExtend={onTimerExtend}
            onStop={onTimerStop}
          />
        </div>
        <div className="pointer-events-auto flex h-12 max-w-[calc(100%-7rem)] items-center gap-1 rounded-xl border border-border bg-background/85 p-1 shadow-lg shadow-black/5 backdrop-blur-xl">
          {isVotingStep(phase) ? (
            <DotVoteSummary voteRemaining={voteRemaining} />
          ) : null}

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-10 gap-2 px-2"
                aria-label={`参加者 ${members.length}人`}
              >
                <span className="flex items-center pl-2" aria-hidden="true">
                  {members.slice(0, 10).map((member, index) => (
                    <span
                      key={member.userId}
                      className={`relative ${
                        index >= 6 ? "hidden xl:inline-flex" : "inline-flex"
                      } ${index > 0 ? "-ml-2" : ""}`}
                      style={{ zIndex: 10 - index }}
                    >
                      <MemberAvatar
                        name={member.name}
                        color={member.color}
                        size={28}
                        isMe={member.userId === currentUserId}
                      />
                    </span>
                  ))}
                </span>
                <span className="text-xs tabular-nums">{members.length}</span>
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
                    <MemberAvatar
                      name={member.name}
                      color={member.color}
                      size={32}
                      isMe={member.userId === currentUserId}
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
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>

          {isResultStep(phase) ? (
            <>
              <Button
                type="button"
                className="h-10 px-4"
                onClick={onShowVoteResult}
              >
                投票結果を表示
              </Button>
              {isFinalStep && isSprintComplete ? (
                <span
                  role="status"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background"
                >
                  <Check aria-hidden="true" className="size-4" />
                  スプリント完了
                </span>
              ) : !isFinalStep && isHost ? (
                <NextPhaseConfirmDialog
                  phase={phase}
                  disabled={
                    isDisconnected || isNextPhasePending || isNextPhaseBlocked
                  }
                  onConfirm={onNextPhase}
                />
              ) : null}
            </>
          ) : isHost ? (
            <NextPhaseConfirmDialog
              phase={phase}
              disabled={
                isDisconnected || isNextPhasePending || isNextPhaseBlocked
              }
              onConfirm={onNextPhase}
            />
          ) : null}

          <Popover open={roomMenuOpen} onOpenChange={setRoomMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="size-10 p-0"
                aria-label="ルームメニューを開く"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" aria-label="ルームメニュー">
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

              {isHost ? (
                <div
                  className="mb-3 flex flex-col gap-3 border-b border-border pb-3"
                  data-testid="board-view-invite"
                >
                  <div className="min-w-0">
                    <span className="block text-xs text-muted-foreground">
                      招待URL
                    </span>
                    <CopyInviteButton
                      value={inviteUrl}
                      itemLabel="招待URL"
                      className="mt-1 block max-w-full text-left"
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-xs text-muted-foreground">
                      招待コード
                    </span>
                    <CopyInviteButton
                      value={inviteCode}
                      itemLabel="招待コード"
                      className="mt-1 block max-w-full text-left"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="destructive"
                  className="h-10 justify-start"
                  disabled={isLeaving}
                  data-testid="leave-button"
                  onClick={() => {
                    setRoomMenuOpen(false);
                    onLeaveClick();
                  }}
                >
                  {leaveLabel}
                </Button>
                {signOutAction ? (
                  <form action={signOutAction}>
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
        </div>

        {connectionLabel !== null ? (
          <span
            role="status"
            className={`pointer-events-auto absolute top-16 right-16 rounded-full border border-border bg-background/85 px-3 py-2 text-xs font-medium tracking-wide shadow-lg shadow-black/5 backdrop-blur-xl ${
              connectionStatus === "closed"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {connectionLabel}
          </span>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
