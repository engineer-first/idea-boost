"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemberAvatar, NOTE_COLOR_NAMES } from "@/features/room-members";
import type { MemberRemovalControls } from "../logic/use-member-removal";

export type MemberRemoveDialogProps = Omit<MemberRemovalControls, "request"> & {
  onClosed?: () => void;
};

export function MemberRemoveDialog({
  open,
  target,
  pending,
  error,
  disconnected,
  blocked,
  onOpenChange,
  onConfirm,
  onClosed,
}: MemberRemoveDialogProps) {
  const locale = useLocale();
  const t = useTranslations("app.boardMemberRemoval") as (
    key: string,
  ) => string;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (!pending) onOpenChange(false);
        }}
        onCloseAutoFocus={(event) => {
          if (onClosed) {
            event.preventDefault();
            onClosed();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          {target ? (
            <div className="flex min-w-0 items-center gap-3">
              <TooltipProvider>
                <MemberAvatar
                  name={target.name}
                  avatarId={target.avatarId}
                  color={target.color}
                />
              </TooltipProvider>
              <div className="min-w-0">
                <p className="break-all text-base font-semibold">
                  {target.name || t("unnamed")}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {t("colorLabel")}:{" "}
                  {locale === "en"
                    ? t(`colors.${target.color}`)
                    : NOTE_COLOR_NAMES[target.color]}
                </p>
              </div>
            </div>
          ) : null}
        </AlertDialogHeader>
        {!target ? (
          <p role="status" className="text-base text-muted-foreground">
            {t("notPresent")}
          </p>
        ) : null}
        {disconnected ? (
          <p role="status" className="text-base text-muted-foreground">
            {t("reconnect")}
          </p>
        ) : null}
        {blocked ? (
          <p role="status" className="text-base text-muted-foreground">
            {t("blocked")}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-base text-destructive">
            {locale === "en" ? t("genericError") : error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={pending}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
            disabled={!target || pending || disconnected || blocked}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? t("removing") : t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
