"use client";

// ログイン後画面共通のヘッダー。
// 左: アプリ名 Idea Boost / 右: ユーザー名 + ログアウト。
// login など未ログイン画面では root layout が描画しない。

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth";

export type AppHeaderProps = {
  // 表示名（メールは出さない）。空ならユーザー名は描画しない。
  userName: string;
};

export function AppHeader({ userName }: AppHeaderProps) {
  const pathname = usePathname();

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
        {userName ? (
          <p
            className="truncate text-sm text-muted-foreground"
            data-testid="app-header-user-name"
          >
            {userName}
          </p>
        ) : null}
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            ログアウト
          </Button>
        </form>
      </div>
    </header>
  );
}
