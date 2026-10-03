"use client";

import { Check, CircleAlert, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type CopyInviteButtonProps = {
  // 表示・クリップボードへ書き込む文字列（招待URL / 招待コード）。
  value: string;
  // aria-label 用の対象名。既定は「招待URL」。
  itemLabel?: string;
  className?: string;
};

type CopyState = "idle" | "success" | "error";

export function CopyInviteButton(props: CopyInviteButtonProps) {
  // コード単独の利用でも、ルーム切替時に前の結果を持ち越さない。
  return <CopyInviteButtonContent key={props.value} {...props} />;
}

function CopyInviteButtonContent({
  value,
  itemLabel = "招待URL",
  className,
}: CopyInviteButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setState("idle");
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    let result: CopyState = "success";
    try {
      // Clipboard APIだけを使用する。追加の権限問い合わせや自動コピーは行わない。
      await navigator.clipboard.writeText(value);
    } catch {
      result = "error";
    }
    if (!mountedRef.current) return;
    pendingRef.current = false;
    setPending(false);
    setState(result);
    timerRef.current = setTimeout(() => {
      setState("idle");
      timerRef.current = null;
    }, 2000);
  };

  const Icon =
    state === "success" ? Check : state === "error" ? CircleAlert : Copy;
  const resultMessage =
    state === "success"
      ? `${itemLabel}をコピーしました`
      : state === "error"
        ? `${itemLabel}をコピーできませんでした。もう一度お試しください。`
        : "";

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        disabled={pending}
        aria-busy={pending}
        aria-label={`${itemLabel}をコピー`}
        title={resultMessage || `${itemLabel}をコピー: ${value}`}
        data-copy-state={state}
        className={cn(
          "inline-flex h-10 w-full min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-3 text-left text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted disabled:cursor-wait",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-wider">
          {value}
        </span>
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0",
            state === "error" && "text-destructive",
          )}
        />
      </button>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {resultMessage}
      </span>
    </>
  );
}
