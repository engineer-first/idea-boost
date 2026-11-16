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
          ログインの期限が切れました
        </AlertDialogTitle>
        <AlertDialogDescription className="text-base leading-relaxed">
          このルームへ進むには、Googleでログインし直してください。
        </AlertDialogDescription>
        <p className="text-base leading-relaxed text-foreground">
          {continuation}
        </p>
        {message && (
          <p role="status" className="text-base leading-relaxed">
            {message}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            className="h-12 whitespace-normal text-sm"
            disabled={pending}
            onClick={onBack}
          >
            {backLabel}
          </Button>
          <Button
            ref={continueButton}
            className="h-12 whitespace-normal px-1 text-sm font-bold leading-5"
            disabled={pending}
            onClick={onContinue}
          >
            {pending ? "準備中…" : "Googleでログインして続ける"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
