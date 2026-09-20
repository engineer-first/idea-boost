"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { VerificationWorkspaceSchema } from "@/contracts/verification";
import { verificationRequest } from "./verification-client";

// 明示的に追従を選んだタブだけに載せる。DOM・CSS・キー操作は追加しない。
export function VerificationFollower({ roomId }: { roomId: string }) {
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll(): Promise<void> {
      try {
        const { active } = await verificationRequest(
          "/api/verification/active",
          VerificationWorkspaceSchema,
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (active && active.roomId !== roomId) {
          router.replace(`/rooms/${active.roomId}?verify=follow`);
          return;
        }
      } catch {
        /* 一時的な失敗で現在のボードを消さず、再取得する。 */
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [roomId, router]);
  return null;
}
