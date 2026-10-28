"use client";

import { ChevronDown, UserRound } from "lucide-react";
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
  signOut,
  useDisplayName,
} from "@/features/auth";
import { aboutMenuLabel } from "./app-header-copy";

export type HomeUserMenuProps = {
  userName: string;
  sessionKind?: "guest" | "account";
  currentUserId?: string;
};

export function HomeUserMenu({
  userName,
  currentUserId,
  sessionKind,
}: HomeUserMenuProps) {
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
        <PopoverContent align="end" className="w-48 p-1">
          <Button
            variant="ghost"
            className="min-h-11 w-full justify-start"
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
            className="min-h-11 w-full justify-start"
          >
            <Link href="/about" onClick={() => setMenuOpen(false)}>
              {aboutMenuLabel}
            </Link>
          </Button>
        </PopoverContent>
      </Popover>
      <SignOutControl sessionKind={sessionKind} signOutAction={signOut} />
      <DisplayNameDialog
        controls={displayName}
        onClosed={() => menuTrigger.current?.focus()}
      />
    </>
  );
}
