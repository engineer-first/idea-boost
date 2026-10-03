"use client";

import { CircleAlert, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyInviteButton } from "./copy-invite-button";

export type InviteUrlActionsProps = {
  value: string;
};

export function InviteUrlActions({ value }: InviteUrlActionsProps) {
  // ルーム切替で前の共有・コピー結果を次の招待に持ち越さない。
  return <InviteUrlActionsContent key={value} value={value} />;
}

function InviteUrlActionsContent({ value }: InviteUrlActionsProps) {
  const [supported, setSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    setSupported(typeof navigator.share === "function");
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleShare = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFailed(false);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    try {
      // ユーザー操作内で直接呼ぶ。ルーム内容や個人情報は受け取らずURLのみ。
      await navigator.share({ url: value });
      // APIの完了は相手への配達を保証しないため成功通知は出さない。
    } catch (error) {
      if (
        mountedRef.current &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        setFailed(true);
        timerRef.current = setTimeout(() => {
          setFailed(false);
          timerRef.current = null;
        }, 2000);
      }
    } finally {
      if (mountedRef.current) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  const ShareIcon = failed ? CircleAlert : Share2;
  return (
    <div className="flex w-full min-w-0 flex-col items-end gap-1">
      <CopyInviteButton value={value} itemLabel="招待URL" />
      {supported ? (
        <>
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={handleShare}
            disabled={pending}
            aria-busy={pending}
            aria-label="招待URLを共有"
            title={
              failed
                ? "共有できませんでした。URLをコピーして送ってください。"
                : "端末の共有メニューを開く"
            }
            data-share-state={failed ? "error" : "idle"}
          >
            <ShareIcon
              aria-hidden="true"
              className={failed ? "text-destructive" : undefined}
            />
            共有
          </Button>
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {failed
              ? "共有できませんでした。URLをコピーして送ってください。"
              : ""}
          </span>
        </>
      ) : null}
    </div>
  );
}
