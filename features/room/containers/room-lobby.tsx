"use client";

import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { SetDisplayNameInput } from "@/contracts/display-name";
import { isLobby, type RoomPhase } from "@/contracts/phase";
import type { ServerMessage } from "@/contracts/room-protocol";
import type { DisplayNameResult } from "@/features/auth";
// スタート画面（ロビー）のコンテナ。関心ごとの hook を束ねて view に渡す。
//   - WebSocket 接続と切断時の遷移: use-room-connection
//   - members / phase の適用と入退出通知: use-room-state
// このファイルに残るのは start_phase 送信と
// 「phase が lobby を離れたらボードへ遷移する」というロビー固有の配線だけ。
// ノートは扱わない。
import {
  bindRoomEntryContinuation,
  RoomAdmissionContext,
} from "@/features/auth";
import { notify } from "@/lib/notify";
import {
  getRoomEntryTabId,
  rememberPendingRoomEntry,
} from "@/lib/room-client/entry-tab-storage";
import type { RoomSocketFactory } from "@/lib/room-client/room-client";
import type { Member } from "../logic/room-reducer";
import { useLeaveRoom } from "../logic/use-leave-room";
import { useMemberRemoval } from "../logic/use-member-removal";
import { useRoomAvatar } from "../logic/use-room-avatar";
import { useRoomConnection } from "../logic/use-room-connection";
import { useRoomDisplayName } from "../logic/use-room-display-name";
import { useRoomName } from "../logic/use-room-name";
import { useRoomState } from "../logic/use-room-state";
import { RoomLobbyView } from "../templates/room-lobby-view";

export type RoomLobbyProps = {
  roomId: string;
  // 呼び出し元が指定したボードへの遷移先。未指定なら通常のルームURL。
  boardHref?: string;
  entryAdmission?: string;
  inviteCode: string;
  inviteUrl: string;
  currentUserId: string;
  initialPhase: RoomPhase;
  initialMembers: Member[];
  // テストからフェイク WebSocket を注入するための口。本番では未指定。
  webSocketFactory?: RoomSocketFactory;
  saveDisplayNameAction?: (
    input: SetDisplayNameInput,
  ) => Promise<DisplayNameResult>;
};

export function RoomLobby({
  roomId,
  boardHref,
  entryAdmission,
  inviteCode,
  inviteUrl,
  currentUserId,
  initialPhase,
  initialMembers,
  webSocketFactory,
  saveDisplayNameAction,
}: RoomLobbyProps) {
  const router = useRouter();
  const inheritedAdmission = useContext(RoomAdmissionContext);
  const admission = entryAdmission ?? inheritedAdmission;
  const boardEntryRequest = useRef<{
    admission: string;
    request: Promise<string | null>;
  } | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const roomState = useRoomState({ initialMembers, initialPhase });
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
    };
  }, [clearStartTimeout]);

  const { isLeaving, isLeavingRef, leave } = useLeaveRoom({
    roomId,
  });
  // onMessage にはホイスティングされる関数宣言（下記）を渡す。
  const { connectionStatus, send } = useRoomConnection({
    roomId,
    currentUserId,
    onMessage: handleServerMessage,
    webSocketFactory,
    isLeavingRef,
  });
  const avatarChange = useRoomAvatar({
    connected: connectionStatus === "open",
    blocked: isStarting || isLeaving || !isLobby(roomState.phase),
    send,
  });
  const roomName = useRoomName({
    connected: connectionStatus === "open",
    blocked: isStarting || isLeaving,
    send,
  });
  const displayName = useRoomDisplayName({
    roomId,
    save: saveDisplayNameAction,
    currentUserId,
    members: roomState.members,
    connected: connectionStatus === "open",
    blocked: isStarting || isLeaving,
    send,
  });
  const memberRemoval = useMemberRemoval({
    currentUserId,
    connected: connectionStatus === "open",
    blocked: isStarting || isLeaving,
    members: roomState.members,
    send,
  });
  // 既にボード工程ならボードへ直行（SSR でも redirect しているが、state 初期値が
  // 古い場合のリカバリとしても機能する）。
  useEffect(() => {
    let active = true;
    if (!isLobby(roomState.phase)) {
      const href = boardHref ?? `/rooms/${roomId}`;
      if (!admission) {
        router.replace(href);
        return;
      }
      const continuationAdmission = admission;
      if (boardEntryRequest.current?.admission !== continuationAdmission) {
        boardEntryRequest.current = {
          admission: continuationAdmission,
          request: bindRoomEntryContinuation(
            continuationAdmission,
            roomId,
            getRoomEntryTabId(),
          ),
        };
      }
      void boardEntryRequest.current.request
        .then((token) => {
          if (!active) return;
          if (token) {
            rememberPendingRoomEntry(token);
            router.replace(
              `${href}${href.includes("?") ? "&" : "?"}entry=${encodeURIComponent(token)}`,
            );
          } else {
            notify.error("入室を確認し直しています。");
            router.replace(href);
          }
        })
        .catch(() => {
          if (active) {
            notify.error("入室を確認し直しています。");
            router.replace(href);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [roomState.phase, roomId, boardHref, admission, router]);

  function handleServerMessage(message: ServerMessage) {
    if (avatarChange.applyMessage(message)) return;
    if (roomName.applyMessage(message)) return;
    if (displayName.applyMessage(message)) return;
    if (memberRemoval.applyMessage(message)) return;
    if (message.type === "snapshot" || message.type === "phase:updated") {
      if (
        (message.type === "phase:updated" || message.type === "snapshot") &&
        !isLobby(message.phase)
      ) {
        clearStartTimeout();
        setIsStarting(true);
      }
    }
    if (message.type === "error") {
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
    if (isStarting || connectionStatus !== "open" || memberRemoval.isPending())
      return;
    setIsStarting(true);
    const sent = send({
      type: "start_phase",
    });
    if (!sent) {
      setIsStarting(false);
      return;
    }
    // 成功時は phase:updated → router.replace で /rooms/[id] へ遷移。
    // 失敗時（forbidden / 接続断）は上記の error ハンドラで isStarting を解除。
    // 万一何も起きない場合は 5 秒でタイムアウトさせて再操作可能にする。
    clearStartTimeout();
    startTimeoutRef.current = setTimeout(() => {
      startTimeoutRef.current = null;
      setIsStarting(false);
    }, 5000);
  }, [
    isStarting,
    connectionStatus,
    send,
    clearStartTimeout,
    memberRemoval.isPending,
  ]);

  return (
    <RoomLobbyView
      loginReturnHref={`/rooms/${roomId}`}
      avatarChange={avatarChange}
      connectedUserIds={
        roomState.progress.progressRevision > 0
          ? roomState.progress.connectedUserIds
          : undefined
      }
      displayName={displayName}
      roomName={roomName}
      memberRemoval={memberRemoval}
      members={roomState.members}
      currentUserId={currentUserId}
      phase={roomState.phase}
      inviteCode={inviteCode}
      inviteUrl={inviteUrl}
      connectionStatus={connectionStatus}
      isStarting={isStarting}
      onStart={handleStart}
      onLeave={leave}
      isLeaving={isLeaving}
    />
  );
}
