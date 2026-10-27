"use client";

// ログイン後画面共通のヘッダー。
// login など未ログイン画面では root layout が描画しない。
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth";
import { clearStoredLastRoom } from "@/lib/room-client/last-room-storage-cleanup";

// root layoutがAppHeaderを描画しない匿名LPでは、ホーム専用chunkを取得しない。
// /homeの初回はSSRし、client遷移の取得待ちではメニューの操作領域を確保する。
const HomeUserMenu = dynamic(
  () => import("./home-user-menu").then((module) => module.HomeUserMenu),
  {
    loading: () => (
      <span
        aria-hidden="true"
        data-testid="home-user-menu-placeholder"
        className="block min-h-11 min-w-11"
      />
    ),
  },
);

export type AppHeaderProps = {
  // 表示名（メールは出さない）。空ならユーザー名は描画しない。
  userName: string;
  currentUserId?: string;
};

export function AppHeader({ userName, currentUserId }: AppHeaderProps) {
  const pathname = usePathname();
  // スプリント開始後のボードだけは、進行レールへ統合してキャンバスを広く保つ。
  // /start のロビーなど、前後の画面では共通ヘッダーを維持する。
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
        {pathname === "/home" ? (
          <HomeUserMenu userName={userName} currentUserId={currentUserId} />
        ) : (
          <>
            {userName ? (
              <span
                className="max-w-48 truncate text-sm text-muted-foreground"
                data-testid="app-header-user-name"
              >
                {userName}
              </span>
            ) : null}
            <form action={signOut} onSubmit={() => clearStoredLastRoom()}>
              <Button type="submit" variant="outline" size="sm">
                ログアウト
              </Button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
