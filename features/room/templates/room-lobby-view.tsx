"use client";

import { DoorOpen, Link2, Pencil, Play, Users } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeaveOutcomeAccess } from "@/contracts/completed-rooms";
import { isLobby, type RoomPhase } from "@/contracts/phase";
// WebSocket接続と操作の確定はroom-lobby.tsxが持ち、ここでは待機画面を組み立てる。
import { CopyInviteButton, InviteUrlActions } from "@/features/invite";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import type { Member } from "../logic/room-reducer";
import type { MemberRemovalControls } from "../logic/use-member-removal";
import type { RoomAvatarControls } from "../logic/use-room-avatar";
import type { RoomDisplayNameControls } from "../logic/use-room-display-name";
import type { RoomNameControls } from "../logic/use-room-name";
import { HostTransferDialog } from "../molecules/host-transfer-dialog";
import { LeaveConfirmDialog } from "../molecules/leave-confirm-dialog";
import { MemberRemoveDialog } from "../molecules/member-remove-dialog";
import { RoomConnectionNotice } from "../molecules/room-connection-notice";
import { RoomDisplayNameDialog } from "../molecules/room-display-name-dialog";
import { RoomNameDialog } from "../molecules/room-name-dialog";
import { LobbyMembers } from "../organisms/lobby-members";
import styles from "./room-lobby-view.module.css";

export type RoomLobbyViewProps = {
  members: Member[];
  currentUserId: string;
  isHost: boolean;
  // ホストの userId（メンバー一覧の「ホスト」ラベル表示用）。
  hostUserId: string;
  phase: RoomPhase;
  loginReturnHref?: string;
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
  memberRemoval?: MemberRemovalControls;
  displayName?: RoomDisplayNameControls;
  roomName?: RoomNameControls;
  avatarChange?: RoomAvatarControls;
  connectedUserIds?: readonly string[];
};

export function RoomLobbyView({
  members,
  currentUserId,
  isHost,
  hostUserId,
  phase,
  loginReturnHref,
  inviteCode,
  inviteUrl,
  connectionStatus,
  connectionDelayed = false,
  isStarting,
  onStart,
  onLeave,
  isLeaving,
  onTransferHost,
  isTransferring: transferringHost = false,
  transferError = null,
  memberRemoval,
  displayName,
  roomName,
  avatarChange,
  connectedUserIds,
}: RoomLobbyViewProps) {
  const isTransferring = transferringHost || (memberRemoval?.pending ?? false);
  const isDisconnected = connectionStatus !== "open";
  const lobbyRef = useRef<HTMLDivElement>(null);
  const avatarDescriptionId = useId();
  const membersTitleId = useId();
  const inviteTitleId = useId();
  const disabled = isDisconnected || isStarting || isLeaving || isTransferring;
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [hostTargetId, setHostTargetId] = useState<string | null>(null);
  const transferTriggerRef = useRef<HTMLElement | null>(null);

  return (
    <div
      ref={lobbyRef}
      tabIndex={-1}
      className={styles.lobby}
      data-testid="room-lobby-view"
      data-phase={
        isLobby(phase) ? "lobby" : `phase${phase.phase}-step${phase.step}`
      }
      data-host={isHost ? "true" : undefined}
    >
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.roomTitle}>
            <h1>
              {roomName
                ? (roomName.name ?? "名前のないルーム")
                : "ルーム待機室"}
            </h1>
            {roomName ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={styles.editRoom}
                aria-label="ルーム名を変更"
                title="ルーム名を変更"
                disabled={roomName.disabled || roomName.pending}
                onClick={roomName.request}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <span
            className={styles.memberCount}
            data-testid="room-lobby-view-member-count"
          >
            <Users size={18} aria-hidden="true" />
            {members.length} 名
          </span>
        </header>

        <div className={styles.connectionSlot}>
          <RoomConnectionNotice
            returnHref={loginReturnHref}
            status={connectionStatus}
            delayed={connectionDelayed}
            className={styles.connection}
            testId="lobby-connection-status"
          />
        </div>

        <section
          className={styles.stage}
          aria-labelledby={membersTitleId}
          data-density={members.length <= 4 ? "spacious" : "compact"}
        >
          <div className={styles.stageHeading}>
            <h2 className={styles.stageTitle} id={membersTitleId}>
              {members.length <= 4
                ? "メンバーが揃ったら、はじめよう。"
                : "参加メンバー"}
            </h2>
            <div id={avatarDescriptionId} className={styles.avatarMessage}>
              {avatarChange?.unavailable ? (
                <p>未使用のアイコンがないため変更できません。</p>
              ) : avatarChange?.pending ? (
                <p role="status">アイコンを変更中…</p>
              ) : isDisconnected ? (
                <p>再接続すると、自分のアイコンを変更できます。</p>
              ) : null}
              {avatarChange?.error ? (
                <p role="alert" className="text-destructive">
                  {avatarChange.error}
                </p>
              ) : null}
            </div>
          </div>
          {members.length === 0 ? (
            <p className={styles.empty}>メンバーの参加を待っています。</p>
          ) : (
            <LobbyMembers
              members={members}
              currentUserId={currentUserId}
              hostUserId={hostUserId}
              connectedUserIds={connectedUserIds}
              avatarChange={isLobby(phase) ? avatarChange : undefined}
              avatarDescriptionId={avatarDescriptionId}
              disabled={disabled}
              nameDisabled={displayName?.disabled || displayName?.pending}
              onEditSelf={displayName?.request}
              onSelectMember={
                isHost && isLobby(phase) && onTransferHost
                  ? (userId) => {
                      transferTriggerRef.current =
                        document.activeElement instanceof HTMLElement
                          ? document.activeElement
                          : null;
                      setHostTargetId(userId);
                    }
                  : undefined
              }
            />
          )}
        </section>

        <section
          className={styles.inviteShelf}
          data-testid="room-lobby-view-invite"
          aria-labelledby={inviteTitleId}
        >
          <div className={styles.inviteHeading}>
            <span className={styles.inviteIcon}>
              <Link2 size={24} aria-hidden="true" />
            </span>
            <div>
              <h2 className={styles.inviteTitle} id={inviteTitleId}>
                メンバーを招待
              </h2>
              <p>リンクやコードを送って、仲間を呼ぼう。</p>
            </div>
          </div>
          <div className={styles.inviteUrl}>
            <span>招待URL</span>
            <InviteUrlActions value={inviteUrl} layout="inline" />
          </div>
          <div className={styles.inviteCode}>
            <span>招待コード</span>
            <CopyInviteButton value={inviteCode} itemLabel="招待コード" />
          </div>
          <Button
            type="button"
            onClick={onStart}
            disabled={disabled}
            data-testid="start-phase-button"
            size="lg"
            className={styles.start}
          >
            <Play size={20} aria-hidden="true" />
            {isStarting ? "開始中…" : "セッションを開始"}
          </Button>
        </section>

        <footer className={styles.footer}>
          <details className={styles.privacy}>
            <summary>保存とプライバシーについて</summary>
            <p>
              途中の共有盤面・公開済みの合計票・進行時刻と、完了した成果は自動保存されます。完了時に参加中の人と、成果を残して途中退出した人は、完了から30日間、成果と保存できた5つの場面を見返せます。{" "}
              <Link
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                保存とプライバシーについて（別タブ）
              </Link>
            </p>
          </details>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setLeaveDialogOpen(true)}
            disabled={isLeaving}
            data-testid="leave-button"
            className={styles.leave}
          >
            <DoorOpen size={16} aria-hidden="true" />
            {isHost
              ? isLeaving
                ? "解散中…"
                : "ルームを解散"
              : isLeaving
                ? "退出中…"
                : "退出する"}
          </Button>
        </footer>
      </div>

      {isHost && isLobby(phase) && onTransferHost && hostTargetId !== null ? (
        <HostTransferDialog
          open
          onOpenChange={(open) => {
            if (!open) setHostTargetId(null);
          }}
          target={
            members.find((member) => member.userId === hostTargetId) ?? null
          }
          onRequestRemove={
            memberRemoval
              ? () => {
                  memberRemoval.request(hostTargetId);
                  setHostTargetId(null);
                }
              : undefined
          }
          onConfirm={onTransferHost}
          pending={isTransferring}
          disconnected={isDisconnected}
          error={transferError}
          onClosed={() => {
            if (transferTriggerRef.current?.isConnected)
              transferTriggerRef.current.focus();
            else
              (
                lobbyRef.current?.querySelector<HTMLButtonElement>(
                  '[data-testid="room-members"] button',
                ) ?? lobbyRef.current
              )?.focus();
          }}
        />
      ) : null}
      {roomName ? <RoomNameDialog controls={roomName} /> : null}
      {displayName ? <RoomDisplayNameDialog controls={displayName} /> : null}
      {memberRemoval ? (
        <MemberRemoveDialog
          {...memberRemoval}
          onClosed={() => {
            if (transferTriggerRef.current?.isConnected)
              transferTriggerRef.current.focus();
            else lobbyRef.current?.focus();
          }}
        />
      ) : null}
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
