"use client";

// ログイン後画面共通のヘッダー。
// 左: アプリ名 Idea Boost / 右: ユーザー名 + ログアウト。
// login など未ログイン画面では root layout が描画しない。

import { ChevronDown, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DisplayNameDialog, signOut, useDisplayName } from "@/features/auth";
import { clearLastRoom } from "@/lib/room-client/last-room-storage";
import { aboutMenuLabel } from "./app-header-copy";

export type AppHeaderProps = {
  // 表示名（メールは出さない）。空ならユーザー名は描画しない。
  userName: string;
  currentUserId?: string;
};

export function AppHeader({ userName, currentUserId }: AppHeaderProps) {
  const pathname = usePathname();
  const isHome = pathname === "/home";
  const displayName = useDisplayName({
    currentUserId: isHome ? currentUserId : undefined,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isHome) setMenuOpen(false);
  }, [isHome]);

  // スプリント開始後のボードだけは、進行レールへ統合してキャンバスを広く保つ。
  // `/start` のロビーなど、前後の画面では共通ヘッダーを維持する。
  if (/^\/rooms\/[^/]+$/.test(pathname)) return null;

  return (
    <header
      className="sticky top-0 z-50 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      data-testid="app-header"
    >
      <p
        className="text-base font-semibold tracking-tight"
        data-testid="app-header-brand"
      >
        Idea Boost
      </p>
      <div className="flex min-w-0 items-center gap-3">
        {isHome ? (
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
        ) : userName ? (
          <span
            className="max-w-48 truncate text-sm text-muted-foreground"
            data-testid="app-header-user-name"
          >
            {userName}
          </span>
        ) : null}

        <form action={signOut} onSubmit={() => clearLastRoom()}>
          <Button type="submit" variant="outline" size="sm">
            ログアウト
          </Button>
        </form>
      </div>
      {isHome && (
        <DisplayNameDialog
          controls={displayName}
          onClosed={() => menuTrigger.current?.focus()}
        />
      )}
    </header>
  );
}
