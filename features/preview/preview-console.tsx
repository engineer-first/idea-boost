"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  type PreviewCheckpoint,
  PreviewRoomErrorSchema,
  PreviewRoomSchema,
} from "@/contracts/preview";
import { PreviewView } from "./preview-view";

// ステップ選択から開くルーム用のタブ名。同じ名前で開くと既存のタブを再利用する。
const ROOM_TAB = "idea-boost-preview-room";

// 同じoriginの空のタブか。別のページへ移った場合は読めないか、空でなくなる。
function isBlank(tab: Window): boolean {
  try {
    return !tab.closed && tab.location.href === "about:blank";
  } catch {
    return false;
  }
}

// クリック直後（ポップアップ許可の範囲内）に開く。既存のタブは作成完了まで今のルームを表示し続ける。
function openRoomTab(): { tab: Window; fresh: boolean } | null {
  const tab = window.open("", ROOM_TAB);
  return tab ? { tab, fresh: isBlank(tab) } : null;
}

const CREATION_ERROR =
  "ルームを準備できませんでした。ログインと接続を確認して、ステップを選び直してください。";

export function PreviewConsole({ partner }: { partner: boolean }) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create(checkpoint: PreviewCheckpoint): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    const opened = openRoomTab();
    let message = CREATION_ERROR;
    try {
      const res = await fetch("/api/preview/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpoint }),
        signal: AbortSignal.timeout(15000),
      });
      const body: unknown = await res.json().catch(() => null);
      const parsed = PreviewRoomSchema.safeParse(body);
      if (!res.ok || !parsed.success) {
        const reason = PreviewRoomErrorSchema.safeParse(body);
        if (reason.success) message = reason.data.error;
        throw new Error(message);
      }
      const path = `/rooms/${parsed.data.roomId}`;
      if (opened && !opened.tab.closed) {
        opened.tab.location.href = path;
        opened.tab.focus();
        busy.current = false;
        setPending(false);
      } else router.push(path);
    } catch {
      // このクリックで開いた空のタブだけ閉じる。準備中に使われ始めたタブは残す。
      if (opened?.fresh && isBlank(opened.tab)) opened.tab.close();
      setError(message);
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <PreviewView
      pending={pending}
      error={error}
      partner={partner}
      onCreate={create}
    />
  );
}
