"use client";

// ログイン後画面共通のヘッダー。
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth";
import { clearStoredLastRoom } from "@/lib/room-client/last-room-storage-cleanup";

// ホーム専用の編集UIと検証スキーマを、匿名LPの初期依存から外す。
const HomeUserMenu = dynamic(() =>
  import("./home-user-menu").then((module) => module.HomeUserMenu),
);

export type AppHeaderProps = {
  userName: string;
  currentUserId?: string;
};

export function AppHeader({ userName, currentUserId }: AppHeaderProps) {
  const pathname = usePathname();
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
