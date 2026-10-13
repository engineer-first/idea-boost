"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { type PreviewCheckpoint, PreviewRoomSchema } from "@/contracts/preview";
import { PreviewView } from "./preview-view";

const CREATION_ERROR =
  "ルームを準備できませんでした。ログインと接続を確認して、ステップを選び直してください。";

export function PreviewConsole() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create(checkpoint: PreviewCheckpoint): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/preview/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoint }),
        signal: AbortSignal.timeout(15000),
      });
      const body: unknown = await res.json().catch(() => null);
      const parsed = PreviewRoomSchema.safeParse(body);
      if (!res.ok || !parsed.success) throw new Error(CREATION_ERROR);
      router.push(`/rooms/${parsed.data.roomId}`);
    } catch {
      setError(CREATION_ERROR);
      busy.current = false;
      setPending(false);
    }
  }
  return <PreviewView pending={pending} error={error} onCreate={create} />;
}
