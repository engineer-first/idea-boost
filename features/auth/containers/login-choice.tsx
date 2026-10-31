"use client";

import { useRouter } from "next/navigation";
import { GuestNameForm } from "../molecules/guest-name-form";
import { LoginCard, type LoginCardProps } from "../molecules/login-card";

export type LoginChoiceProps = Omit<LoginCardProps, "guestForm"> & {
  next: string;
};

export function LoginChoice({ next, ...props }: LoginChoiceProps) {
  const router = useRouter();
  return (
    <LoginCard
      {...props}
      guestForm={<GuestNameForm onPrepared={() => router.replace(next)} />}
    />
  );
}
