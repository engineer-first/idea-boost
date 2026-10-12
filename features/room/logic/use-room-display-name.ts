"use client";

import { useRef } from "react";
import type { SetDisplayNameInput } from "@/contracts/display-name";
import type {
  ClientMessage,
  ProtocolMember,
  ServerMessage,
} from "@/contracts/room-protocol";
import { type DisplayNameResult, useDisplayName } from "@/features/auth";

export type RoomDisplayNameControls = {
  open: boolean;
  draft: string;
  pending: boolean;
  error: string | null;
  disabled: boolean;
  request: () => void;
  onDraftChange: (name: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onClosed?: () => void;
  onRetry?: () => Promise<void>;
  loading?: boolean;
};
type Options = {
  roomId: string;
  currentUserId: string;
  members: ProtocolMember[];
  connected: boolean;
  blocked: boolean;
  send: (message: ClientMessage) => boolean;
  save?: (input: SetDisplayNameInput) => Promise<DisplayNameResult>;
};
export function useRoomDisplayName({
  roomId,
  currentUserId,
  members,
  connected,
  blocked,
  save,
}: Options): RoomDisplayNameControls & {
  applyMessage: (message: ServerMessage) => boolean;
} {
  const controls = useDisplayName({
    roomId,
    currentUserId,
    initialName:
      members.find((member) => member.userId === currentUserId)?.name ?? "",
    save,
  });
  const triggerRef = useRef<HTMLElement | null>(null);
  const disabled =
    !connected ||
    blocked ||
    !members.some((member) => member.userId === currentUserId);
  return {
    ...controls,
    disabled,
    request: () => {
      if (disabled) return;
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      triggerRef.current = active?.closest(
        '[data-testid="room-members-overflow-dialog"]',
      )
        ? document.querySelector<HTMLElement>(
            '[data-testid="room-members-overflow"]',
          )
        : active?.closest("[data-radix-popper-content-wrapper]")
          ? document.querySelector<HTMLElement>(
              '[data-host-transfer-origin][data-state="open"], [data-testid="room-menu-trigger"][data-state="open"]',
            )
          : active;
      void controls.request();
    },
    onConfirm: () => {
      if (!disabled) void controls.onConfirm();
    },
    applyMessage: () => false,
    onClosed: () => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    },
  };
}
