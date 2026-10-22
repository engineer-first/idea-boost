"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { RoomPhase } from "@/contracts/phase";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import {
  canSendSharingReaction,
  SHARING_REACTION_DURATION_MS,
  SHARING_REACTION_INTERVAL_MS,
  SHARING_REACTION_MAX_PER_ACCOUNT,
  SHARING_REACTION_MAX_VISIBLE,
} from "@/contracts/sharing-reactions";
import type { RoomScreenConnectionStatus } from "./connection-status";

export type SharingReaction = {
  id: string;
  senderId: string;
  slot: number;
  expiresAt: number;
};

export type SharingReactionControls = {
  disabled: boolean;
  onSendLike: () => void;
};

export type UseSharingReactionsResult = {
  reactions: SharingReaction[];
  canSendLike: boolean;
  sendLike: () => void;
  applyMessage: (message: ServerMessage, receivedAt?: number) => void;
};

export function useSharingReactions({
  phase,
  phaseRevision,
  connectionStatus,
  blocked = false,
  send,
}: {
  phase: RoomPhase;
  phaseRevision: number;
  connectionStatus: RoomScreenConnectionStatus;
  blocked?: boolean;
  send: (message: ClientMessage) => boolean | undefined;
}): UseSharingReactionsResult {
  const [reactions, setReactions] = useState<SharingReaction[]>([]);
  const [coolingDown, setCoolingDown] = useState(false);
  const nextSlotRef = useRef(0);
  const sentAtRef = useRef<number[]>([]);
  const cooldownUntilRef = useRef(0);
  const lastSentAtRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextRef = useRef({
    phase,
    phaseRevision,
    connectionStatus,
    blocked,
  });
  const phaseKey =
    phase.kind === "step" ? `${phase.phase}-${phase.step}` : phase.kind;

  const refreshSendLimit = useCallback((resetCount = false): void => {
    const now = Date.now();
    sentAtRef.current = resetCount
      ? []
      : sentAtRef.current.filter(
          (sentAt) => sentAt + SHARING_REACTION_DURATION_MS > now,
        );
    // 工程変更では表示件数だけ解除し、サーバーと同じ400ms間隔を維持する。
    cooldownUntilRef.current = Math.max(
      lastSentAtRef.current === null
        ? now
        : lastSentAtRef.current + SHARING_REACTION_INTERVAL_MS,
      sentAtRef.current.length >= SHARING_REACTION_MAX_PER_ACCOUNT
        ? sentAtRef.current[0] + SHARING_REACTION_DURATION_MS
        : now,
    );
    if (cooldownTimerRef.current !== null) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    const remaining = cooldownUntilRef.current - now;
    setCoolingDown(remaining > 0);
    if (remaining > 0)
      cooldownTimerRef.current = setTimeout(
        () => setCoolingDown(false),
        remaining,
      );
  }, []);

  useLayoutEffect(() => {
    const previous = contextRef.current;
    const previousKey =
      previous.phase.kind === "step"
        ? `${previous.phase.phase}-${previous.phase.step}`
        : previous.phase.kind;
    contextRef.current = { phase, phaseRevision, connectionStatus, blocked };
    if (
      previousKey !== phaseKey ||
      previous.phaseRevision !== phaseRevision ||
      connectionStatus !== "open" ||
      blocked
    ) {
      refreshSendLimit(
        previousKey !== phaseKey || previous.phaseRevision !== phaseRevision,
      );
      setReactions((current) => (current.length === 0 ? current : []));
    }
  }, [
    phase,
    phaseKey,
    phaseRevision,
    connectionStatus,
    blocked,
    refreshSendLimit,
  ]);

  useEffect(() => {
    if (reactions.length === 0) return;
    const nextExpiry = Math.min(
      ...reactions.map((reaction) => reaction.expiresAt),
    );
    const timer = setTimeout(
      () => {
        setReactions((current) =>
          current.filter((reaction) => reaction.expiresAt > Date.now()),
        );
      },
      Math.max(0, nextExpiry - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [reactions]);

  useEffect(
    () => () => {
      if (cooldownTimerRef.current !== null)
        clearTimeout(cooldownTimerRef.current);
    },
    [],
  );

  const sendLike = useCallback((): void => {
    const current = contextRef.current;
    const now = Date.now();
    const recentSends = sentAtRef.current.filter(
      (sentAt) => sentAt + SHARING_REACTION_DURATION_MS > now,
    );
    if (
      current.connectionStatus !== "open" ||
      current.blocked ||
      !canSendSharingReaction(current.phase) ||
      now < cooldownUntilRef.current ||
      recentSends.length >= SHARING_REACTION_MAX_PER_ACCOUNT
    )
      return;
    if (
      send({
        type: "reaction:send",
        kind: "like",
        phaseRevision: current.phaseRevision,
      }) === false
    )
      return;
    sentAtRef.current = [...recentSends, now];
    lastSentAtRef.current = now;
    refreshSendLimit();
  }, [send, refreshSendLimit]);

  const applyMessage = useCallback(
    (message: ServerMessage, receivedAt = Date.now()): void => {
      if (message.type === "snapshot" || message.type === "phase:updated") {
        const previous = contextRef.current;
        refreshSendLimit(
          previous.phaseRevision !== (message.phaseRevision ?? 0) ||
            previous.phase.kind !== message.phase.kind ||
            (previous.phase.kind === "step" &&
              message.phase.kind === "step" &&
              (previous.phase.phase !== message.phase.phase ||
                previous.phase.step !== message.phase.step)),
        );
        contextRef.current = {
          ...contextRef.current,
          phase: message.phase,
          phaseRevision: message.phaseRevision ?? 0,
        };
        setReactions((current) => (current.length === 0 ? current : []));
        return;
      }
      const context = contextRef.current;
      if (
        message.type !== "reaction:received" ||
        context.connectionStatus !== "open" ||
        context.blocked ||
        !canSendSharingReaction(context.phase) ||
        message.phaseRevision !== context.phaseRevision
      )
        return;
      const reaction: SharingReaction = {
        id: message.id,
        senderId: message.senderId,
        slot: nextSlotRef.current++ % SHARING_REACTION_MAX_VISIBLE,
        expiresAt: receivedAt + SHARING_REACTION_DURATION_MS,
      };
      setReactions((current) => {
        if (current.some((item) => item.id === reaction.id)) return current;
        const visible = current.filter((item) => item.expiresAt > receivedAt);
        if (
          visible.filter((item) => item.senderId === reaction.senderId)
            .length >= SHARING_REACTION_MAX_PER_ACCOUNT
        )
          return visible;
        return [...visible, reaction].slice(-SHARING_REACTION_MAX_VISIBLE);
      });
    },
    [refreshSendLimit],
  );

  return {
    reactions,
    canSendLike:
      connectionStatus === "open" &&
      !blocked &&
      !coolingDown &&
      canSendSharingReaction(phase),
    sendLike,
    applyMessage,
  };
}
