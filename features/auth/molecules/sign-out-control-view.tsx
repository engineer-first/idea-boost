"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { GuestIdentityRemovalDialog } from "./guest-identity-removal-dialog";

export type SignOutControlViewProps = {
  sessionKind?: "guest" | "account";
  confirming: boolean;
  onConfirmingChange: (open: boolean) => void;
  onSignOut: () => Promise<void>;
  onSubmit: () => void;
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
  className?: string;
  icon?: ReactNode;
};

export function SignOutControlView({
  sessionKind,
  confirming,
  onConfirmingChange,
  onSignOut,
  onSubmit,
  variant = "outline",
  size = "sm",
  className,
  icon,
}: SignOutControlViewProps) {
  return (
    <>
      {sessionKind === "guest" ? (
        <Button
          type="button"
          variant={variant}
          size={size}
          className={
            className ?? "h-auto min-h-11 max-w-full whitespace-normal"
          }
          onClick={() => onConfirmingChange(true)}
        >
          {icon}このブラウザから本人情報を消す
        </Button>
      ) : (
        <form action={onSignOut} onSubmit={onSubmit}>
          <Button
            type="submit"
            variant={variant}
            size={size}
            className={className}
          >
            {icon}ログアウト
          </Button>
        </form>
      )}
      {sessionKind === "guest" && (
        <GuestIdentityRemovalDialog
          open={confirming}
          onOpenChange={onConfirmingChange}
          onConfirm={() => {
            onSubmit();
            void onSignOut();
          }}
        />
      )}
    </>
  );
}
