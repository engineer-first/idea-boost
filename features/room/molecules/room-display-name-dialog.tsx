"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
  const locale = useLocale();
  const t = useTranslations("app.boardDisplayName");
  const id = useId();
  const tooLong = controls.draft.trim().length > ROOM_DISPLAY_NAME_MAX_LENGTH;
  const error = tooLong
    ? t("tooLong", { max: ROOM_DISPLAY_NAME_MAX_LENGTH })
    : locale === "en" && controls.error
      ? t("genericError")
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
          <DialogTitle>{t("title")}</DialogTitle>
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
              {t("label")}
            </label>
            <Input
              id={id}
              value={controls.draft}
              onChange={(event) => controls.onDraftChange(event.target.value)}
              disabled={controls.pending || controls.loading}
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
                {!tooLong && controls.error && controls.onRetry ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0 text-base"
                    disabled={controls.pending || controls.loading}
                    onClick={() => void controls.onRetry?.()}
                  >
                    {t("retry")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {controls.disabled ? (
              <p role="status" className="text-base text-muted-foreground">
                {t("disabled")}
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
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              className="h-12 font-bold"
              disabled={
                tooLong ||
                controls.pending ||
                controls.loading ||
                controls.disabled
              }
            >
              {controls.pending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
