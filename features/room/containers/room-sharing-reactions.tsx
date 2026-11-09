"use client";

import {
  createContext,
  type ReactNode,
  type Ref,
  useContext,
  useImperativeHandle,
} from "react";
import type { RoomPhase } from "@/contracts/phase";
import type { ClientMessage, ServerMessage } from "@/contracts/room-protocol";
import type { RoomScreenConnectionStatus } from "../logic/connection-status";
import {
  type UseSharingReactionsResult,
  useSharingReactions,
} from "../logic/use-sharing-reactions";
import { SharingReactionControls } from "../molecules/sharing-reaction-controls";
import { SharingReactionDisplay } from "../molecules/sharing-reaction-display";

export type SharingReactionMessageHandler = {
  applyMessage: (message: ServerMessage, receivedAt?: number) => void;
};

export type RoomSharingReactionsProps = {
  phase: RoomPhase;
  phaseRevision: number;
  connectionStatus: RoomScreenConnectionStatus;
  blocked?: boolean;
  send: (message: ClientMessage) => boolean | undefined;
  messageRef: Ref<SharingReactionMessageHandler>;
  children: ReactNode;
};

const SharingReactionsContext = createContext<UseSharingReactionsResult | null>(
  null,
);

export function RoomSharingReactions({
  phase,
  phaseRevision,
  connectionStatus,
  blocked,
  send,
  messageRef,
  children,
}: RoomSharingReactionsProps) {
  const reactions = useSharingReactions({
    phase,
    phaseRevision,
    connectionStatus,
    blocked,
    send,
  });
  useImperativeHandle(
    messageRef,
    () => ({ applyMessage: reactions.applyMessage }),
    [reactions.applyMessage],
  );
  return (
    <SharingReactionsContext value={reactions}>
      {children}
    </SharingReactionsContext>
  );
}

function useRoomSharingReactions(): UseSharingReactionsResult {
  const reactions = useContext(SharingReactionsContext);
  if (reactions === null)
    throw new Error("RoomSharingReactions の内側で使用してください。");
  return reactions;
}

export type RoomSharingReactionControlsProps = { disabled?: boolean };

export function RoomSharingReactionControls({
  disabled = false,
}: RoomSharingReactionControlsProps) {
  const { canSendReaction, sendReaction } = useRoomSharingReactions();
  return (
    <SharingReactionControls
      disabled={disabled || !canSendReaction}
      onSendReaction={sendReaction}
    />
  );
}

export function RoomSharingReactionDisplay() {
  const { reactions } = useRoomSharingReactions();
  return <SharingReactionDisplay reactions={reactions} />;
}
