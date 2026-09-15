import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/app/app-header";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/session/current-user";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Idea Boost",
  title: "Idea Boost",
  description: "Idea Boost authentication",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ログイン済みなら共通ヘッダーを出す（login 等は user=null なので非表示）。
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden">
        {user ? <AppHeader userName={user.name ?? ""} /> : null}
        {/* ヘッダー以外の領域。画面全体のスクロールは禁止し、必要なら各ページ内で制御する */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        <Toaster />
      </body>
    </html>
  );
}
