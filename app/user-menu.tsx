"use client";

import { ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DisplayNameDialog,
  SignOutControl,
  useDisplayName,
} from "@/features/auth";
import { aboutMenuLabel } from "./app-header-copy";

export type UserMenuProps = {
  userName: string;
  signOutAction: () => Promise<void>;
  isHome: boolean;
  sessionKind?: "guest" | "account";
  currentUserId?: string;
};

export function UserMenu({
  userName,
  isHome,
  currentUserId,
  sessionKind,
  signOutAction,
}: UserMenuProps) {
  const displayName = useDisplayName({ currentUserId });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={menuTrigger}
            variant="ghost"
            aria-label="ユーザーメニュー"
            className="min-h-11 min-w-11 max-w-48 gap-1.5 px-2"
          >
            {userName ? (
              <span
                className="truncate text-sm text-muted-foreground"
                data-testid="app-header-user-name"
              >
                {userName}
              </span>
            ) : (
              <UserRound className="size-4" aria-hidden />
            )}
            <ChevronDown
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 max-w-[calc(100vw-2rem)] p-1"
        >
          {isHome && (
            <>
              <Button
                variant="ghost"
                className="min-h-11 w-full justify-start gap-3 px-2"
                onClick={() => {
                  setMenuOpen(false);
                  void displayName.request();
                }}
              >
                表示名を変更
              </Button>
              <Button
                asChild
                variant="ghost"
                className="min-h-11 w-full justify-start gap-3 px-2"
              >
                <Link href="/about" onClick={() => setMenuOpen(false)}>
                  {aboutMenuLabel}
                </Link>
              </Button>
              <hr className="my-1 border-t border-border" />
            </>
          )}
          <SignOutControl
            sessionKind={sessionKind}
            signOutAction={signOutAction}
            onConfirmationClosed={() => {
              requestAnimationFrame(() => menuTrigger.current?.focus());
            }}
            variant="ghost"
            size="default"
            className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-2 text-left"
            icon={<LogOut className="size-4" aria-hidden="true" />}
          />
        </PopoverContent>
      </Popover>
      <DisplayNameDialog
        controls={displayName}
        onClosed={() => menuTrigger.current?.focus()}
      />
    </>
  );
}
