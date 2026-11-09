"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  isValidInviteCode,
  normalizeInviteCode,
} from "@/contracts/invite-code";
import { inviteCopy } from "../logic/invite-copy";
import { JoinRoomSectionView } from "../templates/join-room-section-view";

export function JoinRoomSection() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [showCodeError, setShowCodeError] = useState(false);
  const [moving, startTransition] = useTransition();
  const normalizedCode = normalizeInviteCode(code);
  const isValidCode = isValidInviteCode(normalizedCode);
  const codeError =
    showCodeError && !isValidCode ? inviteCopy.codeError : undefined;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isValidCode) {
      setShowCodeError(code.length > 0);
      return;
    }
    startTransition(() => router.push(`/invite/${normalizedCode}`));
  }

  return (
    <JoinRoomSectionView
      code={code}
      canSubmit={isValidCode}
      onCodeChange={(value) => {
        setCode(value.toUpperCase());
        setShowCodeError(false);
      }}
      onCodeBlur={() => setShowCodeError(code.length > 0 && !isValidCode)}
      codeError={codeError}
      moving={moving}
      onSubmit={handleSubmit}
    />
  );
}
