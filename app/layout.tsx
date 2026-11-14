import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_JP } from "next/font/google";
import { AppHeader } from "@/app/app-header";
import { Toaster } from "@/components/ui/sonner";
import { loadDisplayName } from "@/features/auth";
import { getCurrentUser } from "@/lib/session/current-user";
import "./globals.css";

const notoSans = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  display: "swap",
  preload: false,
});

const geistMono = Geist_Mono({
  preload: false,
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 検索に出すのは LP だけ。LP 以外の画面は既定で noindex にし、
// LP の説明文も引き継がない（#993）。LP は landingMetadata で index を許可する。
export const metadata: Metadata = {
  applicationName: "Idea Boost",
  title: "Idea Boost",
  robots: { index: false, follow: true },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ログイン済みなら共通ヘッダーを出す（login 等は user=null なので非表示）。
  const user = await getCurrentUser();
  const displayName = user ? await loadDisplayName(user.sub) : null;

  return (
    <html
      lang="ja"
      className={`${notoSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden">
        {user ? (
          <AppHeader
            currentUserId={user.sub}
            sessionKind={user.kind}
            userName={displayName?.ok ? (displayName.name ?? "") : ""}
          />
        ) : null}
        {/* ヘッダー以外の領域。画面全体のスクロールは禁止し、必要なら各ページ内で制御する */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        <Toaster />
      </body>
    </html>
  );
}
