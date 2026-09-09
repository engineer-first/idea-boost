"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomPhase } from "@/contracts/phase";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import { createThrottled, type Throttled } from "@/lib/throttle";
import type { CanvasPoint } from "./canvas-camera";
import type { RoomScreenConnectionStatus } from "./connection-status";
import {
  applyCursorPresenceMessage,
  CURSOR_SEND_INTERVAL_MS,
  isCursorPresenceAllowed,
  isRemoteCursorIdle,
  type RemoteCursorPresence,
  type RenderedRemoteCursorPresence,
} from "./cursor-presence";

export type UseCursorPresenceResult = {
  remoteCursors: RenderedRemoteCursorPresence[];
  areCursorsVisible: boolean;
  applyMessage: (message: ServerMessage, receivedAt?: number) => void;
  updateCursor: (point: CanvasPoint, draggingNoteId: string | null) => void;
  leaveCanvas: () => void;
  toggleCursors: () => void;
};

export function useCursorPresence({
  currentUserId,
  phase,
  connectionStatus,
  send,
}: {
  currentUserId: string;
  phase: RoomPhase;
  connectionStatus: RoomScreenConnectionStatus;
  send: (message: ClientMessage) => void;
}): UseCursorPresenceResult {
  const [cursors, setCursors] = useState<RemoteCursorPresence[]>([]);
  const [areCursorsVisible, setAreCursorsVisible] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const sendRef = useRef(send);
  const phaseRef = useRef(phase);
  const connectionStatusRef = useRef(connectionStatus);
  const isPublishedRef = useRef(false);
  const throttledRef = useRef<Throttled<[ClientMessage]> | null>(null);
  sendRef.current = send;
  phaseRef.current = phase;
  connectionStatusRef.current = connectionStatus;

  if (throttledRef.current === null) {
    throttledRef.current = createThrottled(
      (message: ClientMessage) => sendRef.current(message),
      CURSOR_SEND_INTERVAL_MS,
    );
  }

  const leaveCanvas = useCallback(() => {
    throttledRef.current?.cancel();
    if (isPublishedRef.current && connectionStatusRef.current === "open") {
      sendRef.current({ type: "cursor:leave" });
    }
    isPublishedRef.current = false;
  }, []);

  const updateCursor = useCallback(
    (point: CanvasPoint, draggingNoteId: string | null) => {
      if (
        !areCursorsVisible ||
        connectionStatusRef.current !== "open" ||
        !isCursorPresenceAllowed(phaseRef.current)
      ) {
        return;
      }
      isPublishedRef.current = true;
      throttledRef.current?.({
        type: "cursor:update",
        x: point.x,
        y: point.y,
        draggingNoteId,
      });
    },
    [areCursorsVisible],
  );

  const applyMessage = useCallback(
    (message: ServerMessage, receivedAt = Date.now()) => {
      if (message.type === "phase:updated" || message.type === "snapshot") {
        phaseRef.current = message.phase;
      }
      setNow(receivedAt);
      setCursors((current) =>
        applyCursorPresenceMessage(
          current,
          message,
          currentUserId,
          phaseRef.current,
          receivedAt,
        ),
      );
    },
    [currentUserId],
  );

  const toggleCursors = useCallback(() => {
    setAreCursorsVisible((current) => {
      if (current) {
        leaveCanvas();
        setCursors([]);
      }
      return !current;
    });
  }, [leaveCanvas]);

  useEffect(() => {
    if (connectionStatus !== "open" || !isCursorPresenceAllowed(phase)) {
      leaveCanvas();
      setCursors((current) => (current.length === 0 ? current : []));
    }
  }, [connectionStatus, leaveCanvas, phase]);

  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1_000);
    return () => globalThis.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      throttledRef.current?.cancel();
    },
    [],
  );

  return {
    remoteCursors: areCursorsVisible
      ? cursors.map((cursor) => ({
          ...cursor,
          isIdle: isRemoteCursorIdle(cursor, now),
        }))
      : [],
    areCursorsVisible,
    applyMessage,
    updateCursor,
    leaveCanvas,
    toggleCursors,
  };
}
