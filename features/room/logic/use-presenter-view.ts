"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPresenterViewFollowStep, type RoomPhase } from "@/contracts/phase";
import type {
  ClientMessage,
  PresenterView,
  ServerMessage,
} from "@/contracts/room-protocol";
import { createThrottled, type Throttled } from "@/lib/throttle";
import type { RoomScreenConnectionStatus } from "./connection-status";

export type RemotePresenterView = {
  userId: string;
  view: PresenterView;
};

export type UsePresenterViewResult = {
  remoteView: RemotePresenterView | null;
  updateView: (view: PresenterView) => void;
  applyMessage: (message: ServerMessage) => void;
  isFollowedByOthers: boolean;
};

const VIEW_SEND_INTERVAL_MS = 80;

export function usePresenterView({
  currentUserId,
  phase,
  connectionStatus,
  send,
}: {
  currentUserId: string;
  phase: RoomPhase;
  connectionStatus: RoomScreenConnectionStatus;
  send: (message: ClientMessage) => void;
}): UsePresenterViewResult {
  const [remoteView, setRemoteView] = useState<RemotePresenterView | null>(
    null,
  );
  const [isFollowedByOthers, setIsFollowedByOthers] = useState(false);

  const sendRef = useRef(send);
  const phaseRef = useRef(phase);
  const connectionStatusRef = useRef(connectionStatus);
  const throttledRef = useRef<Throttled<[ClientMessage]> | null>(null);

  sendRef.current = send;
  phaseRef.current = phase;
  connectionStatusRef.current = connectionStatus;

  if (throttledRef.current === null) {
    throttledRef.current = createThrottled(
      (message: ClientMessage) => sendRef.current(message),
      VIEW_SEND_INTERVAL_MS,
    );
  }

  const updateView = useCallback((view: PresenterView) => {
    if (
      connectionStatusRef.current !== "open" ||
      !isPresenterViewFollowStep(phaseRef.current)
    ) {
      return;
    }

    throttledRef.current?.({
      type: "view:update",
      view,
    });
  }, []);

  const applyMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === "snapshot" || message.type === "phase:updated") {
        // 視点は永続状態ではないため、snapshotやフェーズ変更時に捨てる。
        setRemoteView(null);
        return;
      }

      if (message.type === "member_left") {
        setRemoteView((current) =>
          current?.userId === message.userId ? null : current,
        );
        return;
      }

      if (message.type === "presenter-follow:status") {
        if (message.presenterUserId === currentUserId) {
          setIsFollowedByOthers(message.isFollowed);
        }
        return;
      }

      if (message.type !== "view:updated") {
        return;
      }

      // 自分が発表者の場合、自分自身をリモート視点として登録しない。
      if (message.userId === currentUserId) {
        return;
      }

      setRemoteView({
        userId: message.userId,
        view: message.view,
      });
    },
    [currentUserId],
  );

  useEffect(() => {
    if (connectionStatus !== "open" || !isPresenterViewFollowStep(phase)) {
      throttledRef.current?.cancel();
      setRemoteView(null);
    }
  }, [connectionStatus, phase]);

  useEffect(
    () => () => {
      throttledRef.current?.cancel();
    },
    [],
  );

  return {
    remoteView,
    isFollowedByOthers,
    updateView,
    applyMessage,
  };
}
