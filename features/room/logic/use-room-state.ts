"use client";

// メンバー一覧・進行状態・タイマーのサーバーメッセージ適用の hook。
// ロビーとボードの両方で使う（ロビーはタイマーを表示しないが、状態の畳み込みは
// 共通のまま害がない）。畳み込みの実体は room-reducer.ts の純関数群。
// 入退出 toast（memberJoined / memberLeft）もここで出す — 両画面で同一の方針。
import { useCallback, useRef, useState } from "react";
import type { RoomPhase } from "@/contracts/phase";
import type { ServerMessage, TimerState } from "@/contracts/room-protocol";
import { roomNotify } from "./room-notify";
import {
  applyCarryoverServerMessage,
  applyDecisionServerMessage,
  applyMemberServerMessage,
  applyPhaseServerMessage,
  applyTimerServerMessage,
  type Carryover,
  type Decision,
  type Member,
  type TimerClientState,
} from "./room-reducer";

export type UseRoomStateResult = {
  members: Member[];
  phase: RoomPhase;
  decision: Decision | null;
  carryovers: Carryover[];
  timer: TimerState;
  timerServerOffsetMs: number;
  applyMessage: (message: ServerMessage, receivedAt?: number) => void;
};

export function useRoomState(options: {
  // SSR 時にサーバーから取得した初期状態。再接続時の flicker を抑える。
  initialMembers: Member[];
  initialPhase: RoomPhase;
}): UseRoomStateResult {
  const [members, setMembers] = useState<Member[]>(options.initialMembers);
  const [phase, setPhase] = useState<RoomPhase>(options.initialPhase);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [carryovers, setCarryovers] = useState<Carryover[]>([]);
  const [timerState, setTimerState] = useState<TimerClientState>({
    timer: { status: "idle" },
    serverOffsetMs: 0,
  });
  // ref を同期更新して、連続メッセージ（再レンダー前）でも最新 members を
  // 引けるようにする（member_left の名前解決に必要）。
  const membersRef = useRef<Member[]>(options.initialMembers);

  const applyMessage = useCallback(
    (message: ServerMessage, receivedAt = Date.now()) => {
      // member_joined / member_left は自分以外の参加者から届く通知。
      // 自分自身の参加・退出はサーバから届かない（broadcastToAllExcept）。
      if (message.type === "member_joined") {
        roomNotify.memberJoined(message.member.name);
      }
      if (message.type === "member_left") {
        // member_left は userId のみなので、除去前の members から名前を引く。
        const left = membersRef.current.find(
          (m) => m.userId === message.userId,
        );
        if (left) {
          roomNotify.memberLeft(left.name);
        }
      }
      const nextMembers = applyMemberServerMessage(membersRef.current, message);
      membersRef.current = nextMembers;
      setMembers(nextMembers);
      setPhase((current) => applyPhaseServerMessage(current, message));
      setDecision((current) => applyDecisionServerMessage(current, message));
      setCarryovers((current) => applyCarryoverServerMessage(current, message));
      setTimerState((current) =>
        applyTimerServerMessage(current, message, receivedAt),
      );
    },
    [],
  );

  return {
    members,
    phase,
    decision,
    carryovers,
    timer: timerState.timer,
    timerServerOffsetMs: timerState.serverOffsetMs,
    applyMessage,
  };
}
