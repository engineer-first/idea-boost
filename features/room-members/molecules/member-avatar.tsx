// 参加メンバーのアバター（イニシャル + RoomDO が割り当てた色）。
// 画像取得は行わない（このスコープ外）。付箋と同じ色トークンから背景色を選び、
// 誰の付箋かをメンバー一覧と対応付けられるようにする。
//
// サイズは prop で変更できるが、RoomMembers 側では 36px 固定で使う前提。
// 「あなた」マーカーは isMe で枠線（ring）として表現する。
// ホバー時の名前表示は Radix Tooltip で行う。
// TooltipProvider は一覧側（RoomMembers）に 1 つ置き、ここでは Tooltip のみ。

import { Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NoteColor } from "@/contracts/room-protocol";
import { NOTE_COLOR_STYLES } from "../logic/note-color";

// 名前の頭文字 2 文字を返す。仕様:
// - 空白で分割し、先頭 2 トークンの先頭 1 文字ずつ
// - 1 トークンだけの場合は文字列の先頭 2 文字（英語 / 日本語の両方に対応）
// - 空文字 / 空白のみは ??
export function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0]?.charAt(0) ?? "";
    const second = parts[1]?.charAt(0) ?? "";
    return ((first || "?") + (second || "?")).toUpperCase();
  }
  return (trimmed.slice(0, 2) || "??").toUpperCase();
}

export type MemberAvatarProps = {
  name: string;
  color: NoteColor;
  // 直径 (px)。既定は 36。
  size?: number;
  // 自分自身かどうか。true で青いリング（"あなた" マーカー）。
  isMe?: boolean;
  // 全票を使い切ったメンバーかどうか。投票先は表示しない。
  isVotingComplete?: boolean;
};

export function MemberAvatar({
  name,
  color,
  size = 36,
  isMe = false,
  isVotingComplete = false,
}: MemberAvatarProps) {
  const initials = initialsOf(name);
  // 自分は ring（枠）で識別する。文言の「（あなた）」は付けない。
  const tooltipText = name || "不明なメンバー";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="img"
          aria-label={`${tooltipText}${isVotingComplete ? "（投票完了）" : ""}`}
          data-testid="avatar"
          data-self={isMe ? "true" : undefined}
          className={`relative inline-flex shrink-0 items-center justify-center rounded-full border border-transparent font-semibold text-slate-900 ${NOTE_COLOR_STYLES[color].avatarClassName} ${
            isMe
              ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background"
              : ""
          }`}
          style={{
            width: size,
            height: size,
            fontSize: Math.round(size * 0.4),
            backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
          }}
        >
          {initials}
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
