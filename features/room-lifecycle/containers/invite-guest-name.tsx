"use client";

import { useRouter } from "next/navigation";
import { GuestNameForm } from "@/features/auth";
import { InviteGuestNameView } from "../templates/invite-guest-name-view";

export type InviteGuestNameProps = { inviteCode: string };

export function InviteGuestName({ inviteCode }: InviteGuestNameProps) {
  const router = useRouter();
  return (
    <InviteGuestNameView inviteCode={inviteCode}>
      <GuestNameForm submitLabel="次へ" onPrepared={() => router.refresh()} />
    </InviteGuestNameView>
  );
}
