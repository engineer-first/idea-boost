"use client";

import { useId } from "react";
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
import type { RoomDisplayNameControls } from "../logic/use-room-display-name";

export function RoomDisplayNameDialog({
  controls,
}: {
  controls: RoomDisplayNameControls;
}) {
  const id = useId();
  return (
    <Dialog open={controls.open} onOpenChange={controls.onOpenChange}>
      <DialogContent
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
          <DialogTitle>このルームでの呼び名</DialogTitle>
          <DialogDescription>
            このルームの参加者に表示されます。Googleアカウントの名前は変わりません。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            controls.onConfirm();
          }}
        >
          <div className="grid gap-2">
            <label htmlFor={id} className="text-sm font-medium">
              呼び名
            </label>
            <Input
              id={id}
              value={controls.draft}
              onChange={(event) => controls.onDraftChange(event.target.value)}
              disabled={controls.pending}
              aria-invalid={!!controls.error}
              aria-describedby={`${id}-hint${controls.error ? ` ${id}-error` : ""}`}
              autoComplete="off"
              className="h-11 text-base"
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.nativeEvent.isComposing)
                  event.preventDefault();
              }}
            />
            <p id={`${id}-hint`} className="text-sm text-muted-foreground">
              {ROOM_DISPLAY_NAME_MAX_LENGTH}文字まで。前後の空白は除かれます。
            </p>
            {controls.error ? (
              <p
                id={`${id}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {controls.error}
              </p>
            ) : null}
            {controls.disabled ? (
              <p role="status" className="text-sm text-muted-foreground">
                接続・ルームの状態を確認してから保存してください。
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
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
              disabled={controls.pending || controls.disabled}
            >
              {controls.pending ? "保存中…" : "保存する"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
