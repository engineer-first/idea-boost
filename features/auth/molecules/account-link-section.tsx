"use client";

import { useActionState } from "react";
import type { AccountLinkResult } from "@/contracts/account-link";
import { startGoogleAccountLink } from "../logic/account-link-actions";
import { AccountLinkSectionView } from "./account-link-section-view";

export type AccountLinkSectionProps = {
  status: "guest" | "linked";
  next: string;
  result?: AccountLinkResult;
};

export function AccountLinkSection({
  status,
  next,
  result,
}: AccountLinkSectionProps) {
  const [, action, pending] = useActionState(async () => {
    await startGoogleAccountLink(next);
  }, undefined);
  return (
    <AccountLinkSectionView
      status={status}
      result={result}
      pending={pending}
      action={action}
    />
  );
}
