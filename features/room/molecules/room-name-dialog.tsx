"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROOM_NAME_MAX_LENGTH } from "@/contracts/room-name";
import type { RoomNameControls } from "../logic/use-room-name";

export function RoomNameDialog({ controls }: { controls: RoomNameControls }) {
  const id = useId();
  const tooLong = controls.draft.trim().length > ROOM_NAME_MAX_LENGTH;
  const error = tooLong
    ? `ルーム名は${ROOM_NAME_MAX_LENGTH}文字以内で入力してください。`
    : controls.error;
  return (
    <Dialog open={controls.open} onOpenChange={controls.onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className={`w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto ${controls.pending ? "[&>[data-slot=dialog-close]]:hidden" : ""}`}
        onCloseAutoFocus={(event) => {
          if (controls.onClosed) {
            event.preventDefault();
            controls.onClosed();
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
          <DialogTitle>ルーム名を変更</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooLong) controls.onConfirm();
          }}
        >
          <div className="grid gap-2">
            <label htmlFor={id} className="text-base font-medium">
              ルーム名
            </label>
            <Input
              id={id}
              value={controls.draft}
              onChange={(event) => controls.onDraftChange(event.target.value)}
              disabled={controls.pending}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              autoComplete="off"
              className="h-11 text-base"
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.nativeEvent.isComposing)
                  event.preventDefault();
              }}
            />
            {error ? (
              <div>
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="text-base text-destructive"
                >
                  {error}
                </p>
              </div>
            ) : null}
            {controls.disabled ? (
              <p role="status" className="text-base text-muted-foreground">
                接続・ルームの状態を確認してから保存してください。
              </p>
            ) : null}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              className="h-12"
              disabled={controls.pending}
              onClick={() => controls.onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              className="h-12 font-bold"
              disabled={tooLong || controls.pending || controls.disabled}
            >
              {controls.pending ? "保存中…" : "保存する"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
