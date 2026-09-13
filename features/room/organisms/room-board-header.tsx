"use client";

// ボード画面の進行レール・ファシリテーションガイドと操作 HUD。
import { Check, LogOut, MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isPhaseStep, isResultStep, type RoomPhase } from "@/contracts/phase";
import type { TimerState } from "@/contracts/room-protocol";
import { CopyInviteButton } from "@/features/invite";
import { MemberAvatar } from "@/features/room-members";
import {
  CONNECTION_STATUS_LABELS,
  type RoomScreenConnectionStatus,
} from "../logic/connection-status";
import { getFacilitationGuide } from "../logic/facilitation-guide";
import type { Member } from "../logic/room-reducer";
import { BoardContext } from "../molecules/board-context";
import { NextPhaseConfirmDialog } from "../molecules/next-phase-confirm-dialog";
import { RoomTimer } from "./room-timer";

export type RoomBoardHeaderProps = {
  children?: ReactNode;
  hmwDecidedIssue: string | null;
  decidedHmw: string | null;
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
  isLeaving: boolean;
  signOutAction?: () => Promise<void>;
  onShowVoteResult: () => void;
  onGuideExpandedChange: (isExpanded: boolean) => void;
  onPrimaryAction?: () => void;
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
  hmwDecidedIssue,
  decidedHmw,
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
  isLeaving,
  signOutAction,
  onShowVoteResult,
  onGuideExpandedChange,
  onPrimaryAction,
  onLeaveClick,
  onNextPhase,
  onTimerStart,
  onTimerPause,
  onTimerResume,
  onTimerExtend,
  onTimerStop,
}: RoomBoardHeaderProps) {
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
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
      <div
        data-testid="board-header-row"
        className="pointer-events-none absolute inset-x-3 top-3 bottom-[7.25rem] z-40 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"
      >
        <div
          className="pointer-events-none flex h-full min-h-0 w-full max-w-[360px] min-w-0 flex-col items-start gap-3"
          data-testid="board-context-column"
        >
          <div className="w-full min-w-0 shrink-0">
            <BoardContext
              phase={phase}
              guide={guide}
              isHost={isHost}
              isExpanded={isGuideExpanded}
              onExpandedChange={onGuideExpandedChange}
              onPrimaryAction={onPrimaryAction}
              hmwDecidedIssue={hmwDecidedIssue}
              decidedHmw={decidedHmw}
            />
          </div>
          {children}
        </div>

        <fieldset
          className="board-hud pointer-events-auto relative flex h-14 min-w-0 shrink-0 items-center justify-end gap-1 rounded-2xl border border-border bg-background p-1.5 shadow-lg shadow-black/5"
          aria-label="ルームの操作"
          data-testid="board-control-hud"
        >
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-10 gap-2 px-2"
                aria-label={`参加者 ${members.length}人`}
                title="参加者一覧を開く"
              >
                <span className="flex items-center pl-2" aria-hidden="true">
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

          {isHost || timer.status !== "idle" ? (
            <span
              aria-hidden="true"
              className="mx-1 h-6 w-px shrink-0 bg-border"
            />
          ) : null}
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
          {isHost ? (
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
              </PopoverContent>
            </Popover>
          ) : null}

          {isResultStep(phase) ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0 px-3 shadow-none"
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
                className="h-10 w-8 shrink-0 p-0"
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

          {connectionLabel !== null ? (
            <span
              data-testid="board-connection-status"
              role="status"
              className={`board-hud pointer-events-auto absolute top-16 right-0 rounded-full border border-border bg-background px-3 py-2 text-xs font-medium tracking-wide shadow-lg shadow-black/5 ${
                connectionStatus === "closed"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {connectionLabel}
            </span>
          ) : null}
        </fieldset>
      </div>
    </TooltipProvider>
  );
}
