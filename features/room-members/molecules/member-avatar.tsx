// 参加メンバーの顔と、RoomDO が割り当てた付箋と同じ背景色。
// 顔の透過画像と色を分け、
// 誰の付箋かをメンバー一覧と対応付けられるようにする。
//
// サイズは prop で変更できるが、RoomMembers 側では 36px 固定で使う前提。
// 「あなた」マーカーは isMe で枠線（ring）として表現する。
// ホバー時の名前表示は Radix Tooltip で行う。
// TooltipProvider は一覧側（RoomMembers）に 1 つ置き、ここでは Tooltip のみ。

import { Check, WifiOff } from "lucide-react";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MEMBER_AVATAR_IDS,
  type MemberAvatarId,
} from "@/contracts/member-avatar";
import type { NoteColor } from "@/contracts/room-protocol";
import { NOTE_COLOR_PALETTE } from "@/contracts/room-protocol";
import { NOTE_COLOR_STYLES } from "../logic/note-color";

export type MemberAvatarProps = {
  name: string;
  color: NoteColor;
  avatarId?: MemberAvatarId;
  isConnected?: boolean;
  // 直径 (px)。既定は 36。
  size?: number;
  // 自分自身かどうか。true で青いリング（"あなた" マーカー）。
  isMe?: boolean;
  // 現在の工程を完了したメンバーかどうか。投票先は表示しない。
  isVotingComplete?: boolean;
  completionLabel?: string;
};

export function MemberAvatar({
  name,
  color,
  avatarId,
  isConnected,
  size = 36,
  isMe = false,
  isVotingComplete = false,
  completionLabel = "投票完了",
}: MemberAvatarProps) {
  const face = avatarId ?? MEMBER_AVATAR_IDS[NOTE_COLOR_PALETTE.indexOf(color)];
  // 自分は ring（枠）で識別する。文言の「（あなた）」は付けない。
  const tooltipText = `${name || "不明なメンバー"}${isConnected === false ? "（接続切れ）" : ""}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="img"
          aria-label={`${tooltipText}${isVotingComplete ? `（${completionLabel}）` : ""}`}
          data-testid="avatar"
          data-self={isMe ? "true" : undefined}
          className={`relative inline-flex shrink-0 items-center justify-center rounded-full border ${NOTE_COLOR_STYLES[color].avatarClassName} ${
            isMe
              ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background"
              : ""
          }`}
          style={{
            width: size,
            height: size,
            backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
            color: NOTE_COLOR_STYLES[color].foregroundColor,
          }}
        >
          <span
            className="absolute inset-0 overflow-hidden rounded-full"
            aria-hidden="true"
          >
            <Image
              src={`/avatars/${face}.webp`}
              alt=""
              width={size}
              height={size}
              unoptimized
              className="size-full object-contain"
              draggable={false}
            />
          </span>
          {isConnected === false ? (
            <span
              data-testid="member-disconnected"
              aria-hidden="true"
              className="absolute -bottom-1 -left-1 inline-flex size-4 items-center justify-center rounded-full border-2 border-background bg-slate-600 text-white"
            >
              <WifiOff className="size-2.5" />
            </span>
          ) : null}
          {isVotingComplete ? (
            <span
              data-testid="member-voting-complete"
              aria-hidden="true"
              className="absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full border-2 border-background bg-emerald-600 text-white shadow-sm"
            >
              <Check className="size-2.5" strokeWidth={3} />
            </span>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}
