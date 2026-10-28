"use client";

import { useState } from "react";
import { clearStoredLastRoom } from "@/lib/room-client/last-room-storage-cleanup";
import {
  SignOutControlView,
  type SignOutControlViewProps,
} from "../molecules/sign-out-control-view";

export type SignOutControlProps = Pick<
  SignOutControlViewProps,
  "sessionKind" | "variant" | "size" | "className" | "icon"
> & {
  signOutAction: () => Promise<void>;
  onConfirmationClosed?: () => void;
};

export function SignOutControl({
  signOutAction,
  onConfirmationClosed,
  ...props
}: SignOutControlProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <SignOutControlView
      {...props}
      confirming={confirming}
      onConfirmingChange={(open) => {
        setConfirming(open);
        if (!open) onConfirmationClosed?.();
      }}
      onSignOut={signOutAction}
      onSubmit={clearStoredLastRoom}
    />
  );
}
