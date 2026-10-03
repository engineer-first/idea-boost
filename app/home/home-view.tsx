// ホーム画面の template（アトミックデザイン: pages 層は使わない）。
// Server Action や認証は app/home/page.tsx の責務。
// アプリ名 Idea Boost は root layout の AppHeader のみが担う。
//
// UX: 2 つの明確な入口（作成 / 参加）を並列に置き、視線誘導と行動の選択を最短にする。

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { CompletedRooms } from "@/features/completed-rooms";
import { CreateRoomSection, JoinRoomSection } from "@/features/room-lifecycle";
import { HomeErrorAlert } from "./home-error-alert";

export type HomeViewProps = {
  error?: string;
  completedRooms?: ReactNode;
};

export function HomeView({ error, completedRooms }: HomeViewProps) {
  return (
    <div
      className="relative flex h-full min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 sm:p-6"
      data-testid="home-view"
    >
      {/* 背景: 落ち着いたグラデーション + ぼかし（shadcn のトークン色のみ） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-muted/40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 size-72 rounded-full bg-primary/5 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-1/4 size-80 rounded-full bg-secondary blur-3xl"
      />

      <div className="relative z-10 my-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            アイデア出しを始めましょう
          </h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            新しいルームを作成するか、招待コードを入力して参加できます。
          </p>
        </header>

        {error ? <HomeErrorAlert message={error} /> : null}

        <div className="grid gap-4 sm:grid-cols-2 sm:items-stretch">
          <CreateRoomSection />
          <JoinRoomSection />
        </div>
        <details className="group rounded-xl border bg-card shadow-sm">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-5 py-4 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              以前のルーム
              <span className="mt-1 block font-normal text-muted-foreground">
                完了した成果を見返す
              </span>
            </span>
            <ChevronDown
              className="size-5 shrink-0 group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="border-t p-4 sm:p-5">
            {completedRooms ?? <CompletedRooms embedded />}
          </div>
        </details>
      </div>
    </div>
  );
}
