"use client";
import type { VerificationActive } from "@/contracts/verification";
import { useVerification } from "./use-verification";
import { VerificationView } from "./verification-view";

export function VerificationConsole({
  initialActive,
  isOwner,
}: {
  initialActive: VerificationActive | null;
  isOwner: boolean;
}) {
  const state = useVerification(initialActive);
  return (
    <VerificationView
      {...state}
      isOwner={isOwner}
      onCreate={state.create}
      onVote={state.vote}
      onRetry={() => void state.refresh()}
    />
  );
}
