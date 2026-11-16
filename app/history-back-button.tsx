"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};
// 直接開いたタブでは戻る先がないため、履歴があるときだけ出す。
const hasPreviousEntry = () => window.history.length > 1;
const serverSnapshot = () => false;

export function HistoryBackButton({ label }: { label: string }) {
  const canGoBack = useSyncExternalStore(
    subscribe,
    hasPreviousEntry,
    serverSnapshot,
  );
  if (!canGoBack) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11"
      onClick={() => window.history.back()}
    >
      {label}
    </Button>
  );
}
