"use client";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROOM_DISPLAY_NAME_MAX_LENGTH } from "@/contracts/room-protocol";
import type { DisplayNameControls } from "../logic/use-display-name";

export function DisplayNameDialog({
  controls,
  disabled = false,
  onClosed,
}: {
  controls: DisplayNameControls;
  disabled?: boolean;
  onClosed?: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wasLoading = useRef(false);
  useEffect(() => {
    if (controls.open && !controls.loading && wasLoading.current)
      inputRef.current?.focus();
    wasLoading.current = controls.loading;
  }, [controls.open, controls.loading]);
  return (
    <Dialog open={controls.open} onOpenChange={controls.onOpenChange}>
      <DialogContent
        className={`w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto ${controls.pending ? "[&>[data-slot=dialog-close]]:hidden" : ""}`}
        onCloseAutoFocus={(event) => {
          if (onClosed) {
            event.preventDefault();
            onClosed();
          }
        }}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (controls.pending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (controls.pending) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>表示名を変更</DialogTitle>
          <DialogDescription>
            このアプリで使う表示名を変更します。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled) void controls.onConfirm();
          }}
        >
          <div className="grid gap-2">
            <label htmlFor={id} className="text-sm font-medium">
              表示名
            </label>
            <Input
              ref={inputRef}
              id={id}
              value={controls.draft}
              onChange={(event) => controls.onDraftChange(event.target.value)}
              disabled={controls.pending || controls.loading}
              className="h-11 text-base"
              autoComplete="off"
              aria-invalid={!!controls.error}
              aria-describedby={`${id}-hint${controls.error ? ` ${id}-error` : ""}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.nativeEvent.isComposing)
                  event.preventDefault();
              }}
            />
            <p id={`${id}-hint`} className="text-sm text-muted-foreground">
              {ROOM_DISPLAY_NAME_MAX_LENGTH}文字以内
            </p>
            {controls.loading ? (
              <p role="status" className="text-sm text-muted-foreground">
                保存済みの表示名を確認しています…
              </p>
            ) : null}
            {controls.error ? (
              <div>
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {controls.error}
                </p>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-sm"
                  disabled={controls.pending || controls.loading}
                  onClick={() => void controls.onRetry()}
                >
                  保存済みの表示名を確認
                </Button>
              </div>
            ) : null}
            {disabled ? (
              <p role="status" className="text-sm text-muted-foreground">
                接続・ルームの状態を確認してから保存してください。
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={controls.pending}
              onClick={() => controls.onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              className="min-h-11"
              disabled={controls.pending || controls.loading || disabled}
            >
              {controls.pending ? "保存中…" : "保存する"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
