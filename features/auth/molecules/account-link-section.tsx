"use client";

import { useActionState, useEffect, useRef } from "react";
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
  const resultRef = useRef<HTMLParagraphElement>(null);
  const focusedResult = useRef(false);
  useEffect(() => {
    if (!result || focusedResult.current) return;
    focusedResult.current = true;
    resultRef.current?.focus();
  }, [result]);
  const [, action, pending] = useActionState(async () => {
    await startGoogleAccountLink(next);
  }, undefined);
  return (
    <AccountLinkSectionView
      status={status}
      result={result}
      resultRef={resultRef}
      pending={pending}
      action={action}
    />
  );
}
