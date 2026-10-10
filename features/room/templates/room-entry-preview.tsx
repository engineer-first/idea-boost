"use client";

import { Hand, Minus, MousePointer2, Plus, Users } from "lucide-react";
import type { RoomPhase } from "@/contracts/phase";
import type { ProtocolMember } from "@/contracts/room-protocol";
import { BoardContext } from "../molecules/board-context";
import { RoomLobbyView } from "./room-lobby-view";

export type RoomEntryPreviewProps = {
  phase: RoomPhase;
  members: ProtocolMember[];
  currentUserId: string;
  hostUserId: string;
  isHost: boolean;
  inviteCode: string;
  inviteUrl: string;
};
const noop = (): void => {};

// 入室確認前の背景。表示専用で、WS接続・本文取得・共有操作を行わない。
export function RoomEntryPreview(props: RoomEntryPreviewProps) {
  return (
    <div
      inert
      aria-hidden="true"
      className="h-full min-h-0 flex-1 overflow-hidden"
      data-testid="room-entry-preview"
    >
      {props.phase.kind === "lobby" ? (
        <RoomLobbyView
          {...props}
          connectionStatus="open"
          isStarting={false}
          isLeaving={false}
          onStart={noop}
          onLeave={noop}
        />
      ) : (
        <div className="relative h-full bg-muted/20">
          <div className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-4 p-3 sm:p-6">
            <div className="w-full max-w-[306px]">
              <BoardContext
                phase={props.phase}
                hmwDecidedIssue={null}
                decidedHmw={null}
              />
            </div>
            <div className="flex h-14 items-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm">
              <Users className="size-4" />
              参加者 {props.members.length}人
            </div>
          </div>
          <p className="absolute bottom-24 inset-x-4 text-center text-sm text-muted-foreground">
            ログイン後に、このルームの付箋を読み込みます。
          </p>
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-5 rounded-2xl border border-border bg-background px-5 py-3 text-muted-foreground">
            <MousePointer2 className="size-5" />
            <Hand className="size-5" />
            <span className="h-6 w-px bg-border" />
            <Minus className="size-4" />
            <span className="text-sm tabular-nums">100%</span>
            <Plus className="size-4" />
          </div>
        </div>
      )}
    </div>
  );
}
