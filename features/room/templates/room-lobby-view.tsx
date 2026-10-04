"use client";

import { DoorOpen, Link2, Play, Users } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LeaveOutcomeAccess } from "@/contracts/completed-rooms";
import { isLobby, type RoomPhase } from "@/contracts/phase";
// スタート画面（メンバー一覧 + 開始ボタン）のプレゼンテーション層。
// ホーム画面と同じ shadcn ベースのレイアウト言語（背景・ヘッダー・Card 分割）。
// WebSocket 接続やプロトコル送信は room-lobby.tsx（コンテナ）の責務。
import { CopyInviteButton, InviteUrlActions } from "@/features/invite";
import { RoomMembers } from "@/features/room-members";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import type { Member } from "../logic/room-reducer";
import { HostTransferDialog } from "../molecules/host-transfer-dialog";
import { LeaveConfirmDialog } from "../molecules/leave-confirm-dialog";
import { RoomConnectionNotice } from "../molecules/room-connection-notice";

export type RoomLobbyViewProps = {
  members: Member[];
  currentUserId: string;
  isHost: boolean;
  // ホストの userId（メンバー一覧の「ホスト」ラベル表示用）。
  hostUserId: string;
  phase: RoomPhase;
  inviteCode: string;
  inviteUrl: string;
  // 接続状態は Container 側で生成し、ここでは表示するだけ。
  connectionStatus: RoomScreenConnectionStatus;
  connectionDelayed?: boolean;
  // 開始ボタンが処理中のとき true（多重押下防止）。Container が setTimeout などで
  // 制御する想定。
  isStarting: boolean;
  onStart: () => void;
  // 退出。
  onLeave: (outcomeAccess?: LeaveOutcomeAccess) => void;
  isLeaving: boolean;
  onTransferHost?: (targetUserId: string) => void;
  isTransferring?: boolean;
  transferError?: string | null;
};

export function RoomLobbyView({
  members,
  currentUserId,
  isHost,
  hostUserId,
  phase,
  inviteCode,
  inviteUrl,
  connectionStatus,
  connectionDelayed = false,
  isStarting,
  onStart,
  onLeave,
  isLeaving,
  onTransferHost,
  isTransferring = false,
  transferError = null,
}: RoomLobbyViewProps) {
  const isDisconnected = connectionStatus !== "open";
  const lobbyRef = useRef<HTMLDivElement>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [hostTargetId, setHostTargetId] = useState<string | null>(null);
  const transferTriggerRef = useRef<HTMLElement | null>(null);

  return (
    <div
      ref={lobbyRef}
      tabIndex={-1}
      className="relative flex h-full min-h-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto p-4 sm:p-6"
      data-testid="room-lobby-view"
      data-phase={
        isLobby(phase) ? "lobby" : `phase${phase.phase}-step${phase.step}`
      }
      data-host={isHost ? "true" : undefined}
    >
      {/* ホームと同じ背景言語 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-muted/40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 size-72 rounded-full bg-primary/5 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-1/4 size-80 rounded-full bg-secondary blur-3xl"
      />

      <div className="relative z-10 my-auto flex w-full max-w-2xl shrink-0 flex-col gap-6">
        <header className="space-y-3 text-center">
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {isHost ? "メンバーを集めて開始" : "ホストの開始を待機中"}
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              {isHost
                ? "招待を共有してメンバーが揃ったらセッションを開始します。"
                : "ホストがセッションを開始するまで、この画面でお待ちください。"}
            </p>
          </div>
          <RoomConnectionNotice
            status={connectionStatus}
            delayed={connectionDelayed}
            className="text-sm text-muted-foreground"
          />
        </header>

        <p className="text-center text-sm text-muted-foreground">
          途中の共有盤面・公開済みの合計票・進行時刻と、完了した成果は自動保存されます。完了時に参加中の人と、成果を残して途中退出した人は、完了から30日間、成果と保存できた5つの場面を見返せます。
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 underline underline-offset-4"
          >
            保存とプライバシーについて（別タブ）
          </Link>
        </p>

        <div
          className={`grid grid-cols-1 gap-4 sm:items-stretch ${
            isHost ? "sm:grid-cols-2" : "sm:grid-cols-1"
          }`}
        >
          {/* メンバー一覧カード */}
          <Card className="flex h-full flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md">
            <CardHeader className="gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <Users className="size-5" aria-hidden />
              </div>
              <div className="space-y-1.5">
                <CardTitle className="text-base">参加中のメンバー</CardTitle>
                <CardDescription className="leading-relaxed">
                  いまルームにいるメンバーです。
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col items-center justify-start pt-0">
              <RoomMembers
                members={members}
                currentUserId={currentUserId}
                hostUserId={hostUserId}
                selectionDisabled={
                  isDisconnected || isStarting || isTransferring || isLeaving
                }
                onSelectMember={
                  isHost && isLobby(phase) && onTransferHost
                    ? (userId) => {
                        const source =
                          document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                        transferTriggerRef.current = source?.closest(
                          '[data-testid="room-members-overflow-dialog"]',
                        )
                          ? (lobbyRef.current?.querySelector<HTMLButtonElement>(
                              '[data-testid="room-members-overflow"]',
                            ) ?? null)
                          : source;
                        setHostTargetId(userId);
                      }
                    : undefined
                }
              />
              {isHost &&
              isLobby(phase) &&
              onTransferHost &&
              hostTargetId !== null ? (
                <HostTransferDialog
                  open
                  onOpenChange={(open) => {
                    if (!open) setHostTargetId(null);
                  }}
                  target={
                    members.find((member) => member.userId === hostTargetId) ??
                    null
                  }
                  onConfirm={onTransferHost}
                  pending={isTransferring}
                  disconnected={isDisconnected}
                  error={transferError}
                  onClosed={() => {
                    if (transferTriggerRef.current?.isConnected)
                      transferTriggerRef.current.focus();
                    else {
                      const fallback =
                        lobbyRef.current?.querySelector<HTMLButtonElement>(
                          '[data-testid="room-members-overflow"]',
                        ) ??
                        lobbyRef.current?.querySelector<HTMLButtonElement>(
                          '[data-testid="room-members"] button',
                        );
                      (fallback ?? lobbyRef.current)?.focus();
                    }
                  }}
                />
              ) : null}
            </CardContent>
            <CardFooter className="justify-center border-t border-border/60 pt-4">
              <span
                className="text-xs text-muted-foreground"
                data-testid="room-lobby-view-member-count"
              >
                {members.length} 名
              </span>
            </CardFooter>
          </Card>

          {/* 招待カード（ホストのみ） */}
          {isHost ? (
            <Card
              className="flex h-full flex-col border-border/80 shadow-sm transition-shadow hover:shadow-md"
              data-testid="room-lobby-view-invite"
            >
              <CardHeader className="gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Link2 className="size-5" aria-hidden />
                </div>
                <div className="space-y-1.5">
                  <CardTitle className="text-base">メンバーを招待</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-center gap-5">
                <div className="flex min-w-0 flex-col items-start gap-1.5">
                  <span className="text-xs text-muted-foreground">招待URL</span>
                  <InviteUrlActions value={inviteUrl} />
                </div>
                <div className="flex min-w-0 flex-col items-start gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    招待コード
                  </span>
                  <CopyInviteButton
                    value={inviteCode}
                    itemLabel="招待コード"
                    className="font-mono tracking-wider"
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* メインアクション */}
        <Card className="border-border/80 shadow-sm">
          <CardFooter className="flex flex-col gap-2 p-4 sm:p-6">
            {isHost ? (
              <Button
                type="button"
                onClick={onStart}
                disabled={isDisconnected || isStarting || isTransferring}
                data-testid="start-phase-button"
                size="lg"
                className="w-full"
              >
                <Play className="size-4" aria-hidden />
                {isStarting ? "開始中…" : "開始する"}
              </Button>
            ) : (
              <p
                data-testid="room-lobby-view-waiting"
                className="w-full rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground"
              >
                ホストが開始するのをお待ちください
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setLeaveDialogOpen(true)}
              disabled={isLeaving}
              data-testid="leave-button"
              size="lg"
              className="w-full"
            >
              <DoorOpen className="size-4" aria-hidden />
              {isHost
                ? isLeaving
                  ? "解散中…"
                  : "ルームを解散"
                : isLeaving
                  ? "退出中…"
                  : "退出する"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <LeaveConfirmDialog
        key={hostUserId}
        open={leaveDialogOpen && !isTransferring}
        onOpenChange={setLeaveDialogOpen}
        onConfirm={onLeave}
        isLeaving={isLeaving}
        mode={isHost ? "disband" : "leave"}
      />
    </div>
  );
}
