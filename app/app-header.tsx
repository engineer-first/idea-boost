"use client";

// ログイン後画面共通のヘッダー。
// login など未ログイン画面では root layout が描画しない。
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { signOut } from "@/features/auth";

// root layoutがAppHeaderを描画しない匿名LPでは、ユーザーメニューのchunkを取得しない。
// 初回はSSRし、client遷移の取得待ちではメニューの操作領域を確保する。
const UserMenu = dynamic(
  () => import("./user-menu").then((module) => module.UserMenu),
  {
    loading: () => (
      <span
        aria-hidden="true"
        data-testid="user-menu-placeholder"
        className="block min-h-11 min-w-11"
      />
    ),
  },
);

export type AppHeaderProps = {
  // 表示名（メールは出さない）。空ならユーザー名は描画しない。
  userName: string;
  sessionKind?: "guest" | "account";
  currentUserId?: string;
};

export function AppHeader({
  userName,
  currentUserId,
  sessionKind,
}: AppHeaderProps) {
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
        className="shrink-0 whitespace-nowrap text-base font-semibold tracking-tight"
        data-testid="app-header-brand"
      >
        Idea Boost
      </p>
      <div className="flex min-w-0 items-center gap-3">
        {/* 画面を移ったらメニューと確認の開閉状態を初期化する。 */}
        <UserMenu
          key={pathname}
          signOutAction={signOut}
          userName={userName}
          currentUserId={currentUserId}
          sessionKind={sessionKind}
          isHome={pathname === "/home"}
        />
      </div>
    </header>
  );
}
