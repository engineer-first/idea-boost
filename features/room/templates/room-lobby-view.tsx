"use client";

import { DoorOpen, Link2, Play, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isLobby, type RoomPhase } from "@/contracts/phase";
// スタート画面（メンバー一覧 + 開始ボタン）のプレゼンテーション層。
// ホーム画面と同じ shadcn ベースのレイアウト言語（背景・ヘッダー・Card 分割）。
// WebSocket 接続やプロトコル送信は room-lobby.tsx（コンテナ）の責務。
import { CopyInviteButton } from "@/features/invite";
import { RoomMembers } from "@/features/room-members";
import {
  CONNECTION_STATUS_LABELS,
  type RoomScreenConnectionStatus,
} from "../logic/connection-status";
import type { Member } from "../logic/room-reducer";
import { LeaveConfirmDialog } from "../molecules/leave-confirm-dialog";

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
  // 開始ボタンが処理中のとき true（多重押下防止）。Container が setTimeout などで
  // 制御する想定。
  isStarting: boolean;
  onStart: () => void;
  // 退出。
  onLeave: () => void;
  isLeaving: boolean;
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
  isStarting,
  onStart,
  onLeave,
  isLeaving,
}: RoomLobbyViewProps) {
  const isDisconnected = connectionStatus !== "open";
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const connectionLabel = CONNECTION_STATUS_LABELS[connectionStatus];

  return (
    <div
      className="relative flex h-full flex-1 items-center justify-center overflow-hidden p-4 sm:p-6"
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

      <div className="relative z-10 flex w-full max-w-2xl flex-col gap-6">
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
          {connectionLabel ? (
            <p
              role="status"
              className={`text-sm ${
                connectionStatus === "closed"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {connectionLabel}
            </p>
          ) : null}
        </header>

        <div
          className={`grid gap-4 sm:items-stretch ${
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
              />
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
                  <CardDescription className="leading-relaxed">
                    URL またはコードを共有して参加を促します。クリックでコピー。
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-center gap-5">
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border/80 bg-muted/30 px-3 py-3">
                  <span className="text-xs text-muted-foreground">招待URL</span>
                  <CopyInviteButton
                    value={inviteUrl}
                    itemLabel="招待URL"
                    className="max-w-full"
                  />
                </div>
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border/80 bg-muted/30 px-3 py-3">
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
                disabled={isDisconnected || isStarting}
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
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onConfirm={onLeave}
        isLeaving={isLeaving}
        mode={isHost ? "disband" : "leave"}
      />
    </div>
  );
}
