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
};

export function SignOutControl({
  signOutAction,
  ...props
}: SignOutControlProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <SignOutControlView
      {...props}
      confirming={confirming}
      onConfirmingChange={setConfirming}
      onSignOut={signOutAction}
      onSubmit={clearStoredLastRoom}
    />
  );
}
