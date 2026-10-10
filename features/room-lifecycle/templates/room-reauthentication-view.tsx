"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/dialog";
export type RoomReauthenticationViewProps = {
  pending?: boolean;
  message?: string;
  continuation?: string;
  backLabel?: string;
  onContinue: () => void;
  onBack: () => void;
  onClosed?: () => void;
};
export function RoomReauthenticationView({
  pending,
  message,
  continuation = "ログイン後、このルームへの移動を続けます。",
  backLabel = "戻る",
  onContinue,
  onBack,
  onClosed,
}: RoomReauthenticationViewProps) {
  const continueButton = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onBack();
      }}
    >
      <AlertDialogContent
        overlayClassName="bg-black/20 backdrop-blur-none"
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl p-6"
        onCloseAutoFocus={(event) => {
          if (onClosed) {
            event.preventDefault();
            onClosed();
          }
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          continueButton.current?.focus();
        }}
      >
        <AlertDialogTitle className="text-xl font-semibold leading-snug text-balance">
          ルームに進む前に、ログインを更新
        </AlertDialogTitle>
        <AlertDialogDescription className="text-base leading-relaxed">
          共同作業の途中でログインが切れるのを防ぐため、Googleでログインし直してください。
        </AlertDialogDescription>
        <p className="text-sm leading-relaxed text-foreground">
          {continuation}
        </p>
        {message && (
          <p role="status" className="text-sm leading-relaxed">
            {message}
          </p>
        )}
        <div className="flex flex-col gap-3">
          <Button
            ref={continueButton}
            className="min-h-11 whitespace-normal"
            disabled={pending}
            onClick={onContinue}
          >
            {pending ? "準備中…" : "Googleでログインして続ける"}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={onBack}
          >
            {backLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
