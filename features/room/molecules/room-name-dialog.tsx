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
import { ROOM_NAME_MAX_LENGTH } from "@/contracts/room-name";
import type { RoomNameControls } from "../logic/use-room-name";

export function RoomNameDialog({ controls }: { controls: RoomNameControls }) {
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
          <DialogTitle>ルーム名を変更</DialogTitle>
          <DialogDescription>
            チームを識別できる名前に揃えられます。変更は参加者全員と成果一覧に反映されます。
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
              ルーム名
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
              {ROOM_NAME_MAX_LENGTH}
              文字以内
            </p>
            {controls.error ? (
              <div>
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {controls.error}
                </p>
              </div>
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
