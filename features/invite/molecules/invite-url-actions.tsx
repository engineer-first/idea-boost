"use client";

import { Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const inputId = useId();

  useEffect(() => {
    setSupported(typeof navigator.share === "function");
  }, []);

  const handleShare = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFailed(false);
    try {
      // ユーザー操作内で直接呼ぶ。ルーム内容や個人情報は受け取らずURLのみ。
      await navigator.share({ url: value });
      // APIの完了は相手への配達を保証しないため成功通知は出さない。
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setFailed(true);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <CopyInviteButton
        value={value}
        itemLabel="招待URL"
        className="block text-left"
      />
      {supported ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleShare}
          disabled={pending}
          aria-label="招待URLを共有"
        >
          <Share2 aria-hidden="true" />
          {pending ? "共有を操作中…" : "共有"}
        </Button>
      ) : null}
      {failed ? (
        <p role="status" className="text-xs text-muted-foreground">
          共有できませんでした。URLをコピーして送ってください。
        </p>
      ) : null}
      <details open={failed || undefined} className="w-full min-w-0">
        <summary className="cursor-pointer text-xs text-muted-foreground underline underline-offset-4">
          URLを手動でコピー
        </summary>
        <label htmlFor={inputId} className="sr-only">
          手動コピー用の招待URL
        </label>
        <Input
          id={inputId}
          value={value}
          readOnly
          className="mt-2 w-full min-w-0 text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
      </details>
    </div>
  );
}
