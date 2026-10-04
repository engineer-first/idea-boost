"use client";
import { useState } from "react";
import { SharedOutcomesView } from "./shared-outcomes-view";
import { useSharedOutcomes } from "./use-shared-outcomes";
export function SharedOutcomes() {
  const state = useSharedOutcomes();
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyMessage(
        "リンクをコピーしました。閲覧にはログインと権限が必要です。",
      );
    } catch {
      setCopyMessage(
        "コピーできませんでした。アドレスバーのURLをコピーしてください。",
      );
    }
  }
  return (
    <SharedOutcomesView
      {...state}
      copyMessage={copyMessage}
      onCopyLink={() => void copyLink()}
    />
  );
}
