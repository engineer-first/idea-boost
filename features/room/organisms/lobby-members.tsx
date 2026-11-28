"use client";

import { Pencil, Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
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
  connectedUserIds?: readonly string[];
  disabled: boolean;
  nameDisabled?: boolean;
  onEditSelf?: () => void;
  onSelectMember?: (userId: string) => void;
  avatarChange?: RoomAvatarControls;
  avatarDescriptionId?: string;
};

// PC では待機領域の幅からも上限を決め、列に収まらない大きさにしない。
const AVATAR_SIZE =
  "min(var(--lobby-avatar-size), var(--lobby-avatar-fit, var(--lobby-avatar-size)))";

export function LobbyMembers({
  members,
  currentUserId,
  connectedUserIds,
  disabled,
  nameDisabled = false,
  onEditSelf,
  onSelectMember,
  avatarChange,
  avatarDescriptionId,
}: LobbyMembersProps) {
  const locale = useLocale();
  const t = useTranslations("app.lobbyMembers");
  const memberMessages = useTranslations("app.boardMemberRemoval") as (
    key: string,
  ) => string;
  const density =
    members.length <= 4
      ? "spacious"
      : members.length <= 10
        ? "medium"
        : "compact";
  const size = density === "spacious" ? 192 : density === "medium" ? 112 : 96;
  return (
    <TooltipProvider>
      <fieldset
        aria-label={t("participants")}
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
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
              }}
            />
          );
          const name = (
            <span className={styles.nameText} title={member.name}>
              {member.name}
            </span>
          );
          const hasDuplicateName = members.some(
            (other) =>
              other.userId !== member.userId && other.name === member.name,
          );
          const duplicateColorName =
            locale === "en"
              ? memberMessages(`colors.${member.color}`)
              : NOTE_COLOR_NAMES[member.color];
          const status = (
            <span className={styles.status}>
              {isMe ? t("you") : null}
              {isConnected === false ? (
                <span>{isMe ? t("youDisconnected") : t("disconnected")}</span>
              ) : null}
              {hasDuplicateName ? <span> {duplicateColorName}</span> : null}
            </span>
          );
          return (
            <div
              key={member.userId}
              className={styles.member}
              data-testid={`member-row-${member.userId}`}
              data-self={isMe ? "true" : undefined}
            >
              {isMe ? (
                <>
                  {avatarChange ? (
                    <button
                      type="button"
                      className={styles.avatarButton}
                      aria-label={
                        avatarChange.pending
                          ? t("avatarChanging")
                          : t("changeMyAvatar")
                      }
                      aria-describedby={avatarDescriptionId}
                      aria-busy={avatarChange.pending}
                      disabled={
                        disabled ||
                        (avatarChange.disabled && !avatarChange.pending)
                      }
                      aria-disabled={avatarChange.pending || undefined}
                      onClick={avatarChange.cycle}
                      data-testid="lobby-avatar-change"
                    >
                      {avatar}
                      <span
                        className={styles.avatarOverlay}
                        data-pending={avatarChange.pending || undefined}
                        aria-hidden="true"
                      >
                        {avatarChange.pending ? (
                          <Spinner className="size-7" />
                        ) : (
                          <Repeat size={28} />
                        )}
                      </span>
                    </button>
                  ) : (
                    avatar
                  )}
                  {onEditSelf ? (
                    <button
                      type="button"
                      className={styles.nameButton}
                      aria-label={t("changeDisplayName", { name: member.name })}
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
                  action="remove"
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
