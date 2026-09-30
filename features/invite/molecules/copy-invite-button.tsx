"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CopyInviteButtonProps = {
  value: string;
  itemLabel?: string;
  className?: string;
};

// 成功時だけ成功表示に切り替える。拒否時は値を選択して手動コピーできる。
export function CopyInviteButton({
  value,
  itemLabel = "招待URL",
  className,
}: CopyInviteButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (copyFailed) {
      manualInputRef.current?.focus();
      manualInputRef.current?.select();
    }
  }, [copyFailed]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyFailed(false);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }, [value]);

  return (
    <div className="flex min-w-0 max-w-full flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "コピーしました" : `${itemLabel}をコピー`}
        title={copied ? "コピーしました" : `クリックで${itemLabel}をコピー`}
        className={cn(
          "min-h-11 max-w-full cursor-pointer truncate rounded-md px-2 text-center font-mono text-sm font-semibold tracking-wider text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        {copied ? "コピーしました" : value}
      </button>
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {copied ? `${itemLabel}をコピーしました` : ""}
      </span>
      {copyFailed ? (
        <>
          <p
            role="alert"
            className="text-center text-sm font-normal tracking-normal text-destructive"
          >
            コピーできませんでした。下の文字列を選択して手動でコピーするか、もう一度お試しください。
          </p>
          <Input
            ref={manualInputRef}
            aria-label={`${itemLabel}（手動コピー）`}
            value={value}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            className="text-base tracking-normal"
          />
        </>
      ) : null}
    </div>
  );
}
