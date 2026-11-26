"use client";

import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import appMessages from "@/messages/ja/app.json";
import { routeStatusCopy } from "./route-status-copy";
import { RouteStatusView } from "./route-status-view";

// 共通レイアウト自体が失敗したときの受け皿。レイアウトの代わりに文書全体を描く。
export default function GlobalError() {
  return (
    <html lang="ja" className="h-full overflow-hidden antialiased">
      <body className="flex h-full flex-col overflow-hidden">
        <title>{routeStatusCopy.error.title}</title>
        <meta name="robots" content="noindex" />
        <NextIntlClientProvider locale="ja" messages={{ app: appMessages }}>
          <RouteStatusView kind="error" />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
