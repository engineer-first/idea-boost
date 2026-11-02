"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuestNameForm } from "../molecules/guest-name-form";
import { LoginCard, type LoginCardProps } from "../molecules/login-card";

export type LoginChoiceProps = Omit<LoginCardProps, "guestForm"> & {
  next: string;
};

export function LoginChoice({ next, ...props }: LoginChoiceProps) {
  const router = useRouter();
  const [guestPending, setGuestPending] = useState(false);
  return (
    <LoginCard
      {...props}
      guestPending={guestPending}
      guestForm={
        <GuestNameForm
          onPrepared={() => router.replace(next)}
          onPendingChange={setGuestPending}
        />
      }
    />
  );
}
