"use client";

import { Pencil, Shuffle } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  MemberAvatar,
  MemberSelection,
  NOTE_COLOR_NAMES,
} from "@/features/room-members";
import type { Member } from "../logic/room-reducer";
import type { RoomAvatarControls } from "../logic/use-room-avatar";
import styles from "./lobby-members.module.css";

export type LobbyMembersProps = {
  members: Member[];
  currentUserId: string;
  hostUserId: string;
  connectedUserIds?: readonly string[];
  disabled: boolean;
  nameDisabled?: boolean;
  onEditSelf?: () => void;
  onSelectMember?: (userId: string) => void;
  avatarChange?: RoomAvatarControls;
  avatarDescriptionId?: string;
};

export function LobbyMembers({
  members,
  currentUserId,
  hostUserId,
  connectedUserIds,
  disabled,
  nameDisabled = false,
  onEditSelf,
  onSelectMember,
  avatarChange,
  avatarDescriptionId,
}: LobbyMembersProps) {
  const density =
    members.length <= 4
      ? "spacious"
      : members.length <= 10
        ? "medium"
        : "compact";
  const size = density === "spacious" ? 192 : density === "medium" ? 112 : 96;
  return (
    <TooltipProvider delayDuration={300}>
      <fieldset
        aria-label="参加者"
        data-testid="room-members"
        data-density={density}
        data-count={members.length}
        className={styles.members}
      >
        {members.map((member) => {
          const isMe = member.userId === currentUserId;
          const isConnected = connectedUserIds?.includes(member.userId);
          const avatar = (
            <MemberAvatar
              key={member.avatarId}
              name={member.name}
              color={member.color}
              avatarId={member.avatarId}
              isConnected={isConnected}
              isMe={isMe}
              size={size}
              style={{
                width: "var(--lobby-avatar-size)",
                height: "var(--lobby-avatar-size)",
              }}
            />
          );
          const name = (
            <span className={styles.nameText} title={member.name}>
              {member.name}
            </span>
          );
          const status = (
            <span className={styles.status}>
              {isMe ? "あなた" : null}
              {member.userId === hostUserId ? (
                <span data-testid={`member-host-label-${member.userId}`}>
                  {isMe ? "・ホスト" : "ホスト"}
                </span>
              ) : null}
              {isConnected === false ? (
                <span>
                  {isMe || member.userId === hostUserId ? "・" : ""}接続切れ
                </span>
              ) : null}
              {members.some(
                (other) =>
                  other.userId !== member.userId && other.name === member.name,
              ) ? (
                <span> {NOTE_COLOR_NAMES[member.color]}</span>
              ) : null}
            </span>
          );
          return (
            <div
              key={member.userId}
              className={styles.member}
              data-testid={`member-row-${member.userId}`}
              data-self={isMe ? "true" : undefined}
              data-host={member.userId === hostUserId ? "true" : undefined}
            >
              {isMe ? (
                <>
                  {avatarChange ? (
                    <button
                      type="button"
                      className={styles.avatarButton}
                      aria-label={
                        avatarChange.pending
                          ? "アイコンを変更中…"
                          : "自分のアイコンを変更"
                      }
                      aria-describedby={avatarDescriptionId}
                      aria-busy={avatarChange.pending}
                      disabled={
                        disabled ||
                        (avatarChange.disabled && !avatarChange.pending)
                      }
                      aria-disabled={avatarChange.pending || undefined}
                      onClick={avatarChange.randomize}
                      data-testid="lobby-avatar-change"
                    >
                      {avatar}
                      <span className={styles.avatarOverlay} aria-hidden="true">
                        <Shuffle size={28} />
                      </span>
                    </button>
                  ) : (
                    avatar
                  )}
                  {onEditSelf ? (
                    <button
                      type="button"
                      className={styles.nameButton}
                      aria-label={`${member.name}：表示名を変更`}
                      aria-haspopup="dialog"
                      onClick={(event) => {
                        event.currentTarget.focus();
                        onEditSelf();
                      }}
                      disabled={disabled || nameDisabled}
                    >
                      {name}
                      <Pencil
                        className={styles.pencil}
                        size={14}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <span className={styles.name}>{name}</span>
                  )}
                  {status}
                </>
              ) : (
                <MemberSelection
                  name={member.name}
                  className={styles.peer}
                  disabled={disabled}
                  onSelect={
                    onSelectMember
                      ? () => onSelectMember(member.userId)
                      : undefined
                  }
                >
                  {avatar}
                  <span className={styles.name}>{name}</span>
                  {status}
                </MemberSelection>
              )}
            </div>
          );
        })}
      </fieldset>
    </TooltipProvider>
  );
}
