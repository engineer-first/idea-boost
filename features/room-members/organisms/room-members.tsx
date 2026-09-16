"use client";

// ルーム内メンバー一覧の表示用コンポーネント。
// MemberAvatar + 名前を 横 4 × 縦 3（最大 12 人）のグリッドで表示する。
// 自分は ring で識別（「（あなた）」文言は付けない）。ホストは名前下にラベル。
// 13 人以上は先頭 12 人 + +N（クリックで隠れメンバー Dialog）。
// データ層に一切依存せず、members / currentUserId / hostUserId を props で受け取るだけ。
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProtocolMember } from "@/contracts/room-protocol";
import { cn } from "@/lib/utils";
import { MemberAvatar } from "../molecules/member-avatar";

// 横 4 × 縦 3。これを超えると +N になる。
export const ROOM_MEMBERS_COLS = 4;
export const ROOM_MEMBERS_ROWS = 3;
export const ROOM_MEMBERS_MAX_VISIBLE = ROOM_MEMBERS_COLS * ROOM_MEMBERS_ROWS;

export type RoomMembersProps = {
  members: ProtocolMember[];
  currentUserId: string;
  // ホストの userId。該当メンバーの名前下に「ホスト」を表示する。
  hostUserId?: string;
  // 先頭から何個まで Avatar + 名前で描画するか。超過分は +N バッジ。
  // 既定は ROOM_MEMBERS_MAX_VISIBLE（12 = 4×3）。
  maxVisible?: number;
  // 全票を使い切ったメンバーの userId。投票先は含まない。
  completedVoterIds?: ReadonlyArray<string>;
};

export function RoomMembers({
  members,
  currentUserId,
  hostUserId,
  maxVisible = ROOM_MEMBERS_MAX_VISIBLE,
  completedVoterIds = [],
}: RoomMembersProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  // 超過があるときは最終マスを +N に使う（4×3 の枠を崩さない）。
  const hasOverflow = members.length > maxVisible;
  const visibleCount = hasOverflow ? maxVisible - 1 : members.length;
  const visible = members.slice(0, visibleCount);
  const overflow = members.slice(visibleCount);
  const hidden = overflow.length;

  return (
    <TooltipProvider delayDuration={300}>
      <fieldset
        aria-label="参加者"
        data-testid="room-members"
        className="m-0 grid w-full max-w-xl grid-cols-4 gap-x-3 gap-y-3 border-0 p-0"
      >
        {visible.map((member) => {
          const isMe = member.userId === currentUserId;
          const isHostMember =
            hostUserId !== undefined && member.userId === hostUserId;
          return (
            <div
              key={member.userId}
              data-testid={`member-row-${member.userId}`}
              data-self={isMe ? "true" : undefined}
              data-host={isHostMember ? "true" : undefined}
              className="flex min-w-0 flex-col items-center gap-1 text-center"
            >
              <MemberAvatar
                name={member.name}
                color={member.color}
                isMe={isMe}
                isVotingComplete={completedVoterIds.includes(member.userId)}
              />
              <span className="flex min-w-0 flex-col items-center">
                <span
                  className={cn(
                    "max-w-full truncate text-[11px] leading-tight",
                    isMe
                      ? "font-semibold text-foreground"
                      : "text-foreground/80",
                  )}
                >
                  {member.name}
                </span>
                {isHostMember ? (
                  <span
                    data-testid={`member-host-label-${member.userId}`}
                    className="text-[10px] font-medium leading-tight text-muted-foreground"
                  >
                    ホスト
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
        {hidden > 0 ? (
          <button
            type="button"
            aria-label={`他 ${hidden} 名`}
            data-testid="room-members-overflow"
            onClick={() => setOverflowOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center justify-self-center self-center rounded-full border-2 border-background bg-muted text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{hidden}
          </button>
        ) : null}
      </fieldset>

      <Dialog open={overflowOpen} onOpenChange={setOverflowOpen}>
        <DialogContent
          className="max-w-sm"
          data-testid="room-members-overflow-dialog"
        >
          <DialogHeader>
            <DialogTitle>他のメンバー</DialogTitle>
          </DialogHeader>
          <ul
            className="flex max-h-72 flex-col gap-3 overflow-y-auto"
            data-testid="room-members-overflow-list"
          >
            {overflow.map((member) => (
              <li
                key={member.userId}
                data-testid={`overflow-member-${member.userId}`}
                className="flex min-w-0 items-center gap-2"
              >
                <MemberAvatar
                  name={member.name}
                  color={member.color}
                  isMe={member.userId === currentUserId}
                  isVotingComplete={completedVoterIds.includes(member.userId)}
                />
                <span className="truncate text-sm text-foreground">
                  {member.name}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
