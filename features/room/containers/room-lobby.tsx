"use client";

// スタート画面（ロビー）のコンテナ。関心ごとの hook を束ねて view に渡す。
//   - WebSocket 接続と切断時の遷移: use-room-connection
//   - members / phase の適用と入退出通知: use-room-state
//   - 退出 / 解散フロー: use-leave-room
// このファイルに残るのは「ホスト判定付きの start_phase 送信」と
// 「phase が lobby を離れたらボードへ遷移する」というロビー固有の配線だけ。
// ノートは扱わない。
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isLobby, type RoomPhase } from "@/contracts/phase";
import type { ServerMessage } from "@/contracts/room-protocol";
import type { RoomSocketFactory } from "@/lib/room-client/room-client";
import type { Member } from "../logic/room-reducer";
import { useLeaveRoom } from "../logic/use-leave-room";
import { useMemberRemoval } from "../logic/use-member-removal";
import { useRoomConnection } from "../logic/use-room-connection";
import { useRoomState } from "../logic/use-room-state";
import { RoomLobbyView } from "../templates/room-lobby-view";

export type RoomLobbyProps = {
  roomId: string;
  // 呼び出し元が指定したボードへの遷移先。未指定なら通常のルームURL。
  boardHref?: string;
  inviteCode: string;
  inviteUrl: string;
  currentUserId: string;
  isHost: boolean;
  // ホストの userId（メンバー一覧の「ホスト」ラベル表示用）。
  hostUserId: string;
  initialPhase: RoomPhase;
  initialMembers: Member[];
  // テストからフェイク WebSocket を注入するための口。本番では未指定。
  webSocketFactory?: RoomSocketFactory;
};

export function RoomLobby({
  roomId,
  boardHref,
  inviteCode,
  inviteUrl,
  currentUserId,
  isHost: initialIsHost,
  hostUserId: initialHostUserId,
  initialPhase,
  initialMembers,
  webSocketFactory,
}: RoomLobbyProps) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const transferringRef = useRef(false);
  const transferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomState = useRoomState({ initialMembers, initialPhase });
  const hostUserId = roomState.host.hostUserId ?? initialHostUserId;
  const isHost = roomState.host.hostUserId
    ? hostUserId === currentUserId
    : (roomState.host.isHost ?? initialIsHost);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStartTimeout = useCallback(() => {
    if (startTimeoutRef.current !== null) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearStartTimeout();
      if (transferTimeoutRef.current) clearTimeout(transferTimeoutRef.current);
    };
  }, [clearStartTimeout]);

  const { isLeaving, isLeavingRef, leave } = useLeaveRoom({
    roomId,
    isHost,
    hostRevision: roomState.host.hostRevision ?? 0,
  });
  // onMessage にはホイスティングされる関数宣言（下記）を渡す。
  const { connectionStatus, send } = useRoomConnection({
    roomId,
    onMessage: handleServerMessage,
    webSocketFactory,
    isLeavingRef,
  });
  const memberRemoval = useMemberRemoval({
    isHost,
    currentUserId,
    hostRevision: roomState.host.hostRevision,
    connected: connectionStatus === "open",
    blocked: isStarting || isTransferring || isLeaving,
    members: roomState.members,
    send,
  });
  // 既にボード工程ならボードへ直行（SSR でも redirect しているが、state 初期値が
  // 古い場合のリカバリとしても機能する）。
  useEffect(() => {
    if (!isLobby(roomState.phase)) {
      router.replace(boardHref ?? `/rooms/${roomId}`);
    }
  }, [roomState.phase, roomId, boardHref, router]);

  function finishTransfer(error: string | null = null) {
    transferringRef.current = false;
    setIsTransferring(false);
    setTransferError(error);
    if (transferTimeoutRef.current) clearTimeout(transferTimeoutRef.current);
    transferTimeoutRef.current = null;
  }

  function handleServerMessage(message: ServerMessage) {
    if (memberRemoval.applyMessage(message)) return;
    if (
      message.type === "host:updated" ||
      message.type === "snapshot" ||
      message.type === "phase:updated"
    ) {
      finishTransfer();
      clearStartTimeout();
      setIsStarting(false);
    }
    if (message.type === "error") {
      if (transferringRef.current) finishTransfer(message.message);
      console.error(`ルーム操作エラー (${message.code}): ${message.message}`);
      if (message.code === "forbidden") {
        // 権限なしで start_phase を送った場合は「開始中」を解除してあげる
        // （押せたのに実は押せなかった、を伝える）。
        clearStartTimeout();
        setIsStarting(false);
      }
      return;
    }
    roomState.applyMessage(message);
  }

  const handleStart = useCallback(() => {
    if (!isHost || transferringRef.current || memberRemoval.isPending()) return;
    setIsStarting(true);
    send({
      type: "start_phase",
      expectedHostRevision: roomState.host.hostRevision ?? 0,
    });
    // 成功時は phase:updated → router.replace で /rooms/[id] へ遷移。
    // 失敗時（forbidden / 接続断）は上記の error ハンドラで isStarting を解除。
    // 万一何も起きない場合は 5 秒でタイムアウトさせて再操作可能にする。
    clearStartTimeout();
    startTimeoutRef.current = setTimeout(() => {
      startTimeoutRef.current = null;
      setIsStarting(false);
    }, 5000);
  }, [
    isHost,
    send,
    clearStartTimeout,
    roomState.host.hostRevision,
    memberRemoval.isPending,
  ]);

  function handleTransfer(targetUserId: string) {
    if (
      !isHost ||
      isStarting ||
      transferringRef.current ||
      memberRemoval.isPending() ||
      connectionStatus !== "open" ||
      roomState.host.hostRevision === null
    )
      return;
    transferringRef.current = true;
    setIsTransferring(true);
    setTransferError(null);
    send({
      type: "host:transfer",
      targetUserId,
      expectedHostRevision: roomState.host.hostRevision,
    });
    transferTimeoutRef.current = setTimeout(
      () =>
        finishTransfer(
          "結果を確認できませんでした。接続を確認してから操作し直してください。",
        ),
      5000,
    );
  }

  return (
    <RoomLobbyView
      key={`${hostUserId}:${roomState.host.hostRevision ?? 0}`}
      memberRemoval={memberRemoval}
      members={roomState.members}
      currentUserId={currentUserId}
      isHost={isHost}
      hostUserId={hostUserId}
      phase={roomState.phase}
      inviteCode={inviteCode}
      inviteUrl={inviteUrl}
      connectionStatus={connectionStatus}
      isStarting={isStarting}
      onTransferHost={
        roomState.host.hostRevision === null ? undefined : handleTransfer
      }
      isTransferring={isTransferring}
      transferError={transferError}
      onStart={handleStart}
      onLeave={leave}
      isLeaving={isLeaving}
    />
  );
}
