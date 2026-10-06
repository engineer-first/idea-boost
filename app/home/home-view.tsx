// ホーム画面の template（アトミックデザイン: pages 層は使わない）。
// Server Action や認証は app/home/page.tsx の責務。
// アプリ名 Idea Boost は root layout の AppHeader のみが担う。
//
// UX: 2 つの明確な入口（作成 / 参加）を並列に置き、視線誘導と行動の選択を最短にする。

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  CreateRoomSection,
  JoinRoomSection,
  ReturnRoomSection,
} from "@/features/room-lifecycle";
import { HomeErrorAlert } from "./home-error-alert";

export type HomeViewProps = {
  error?: string;
  currentUserId?: string;
};

export function HomeView({ error, currentUserId }: HomeViewProps) {
  return (
    <div
      className="relative flex h-full min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 sm:p-6"
      data-testid="home-view"
    >
      {/* 装飾はスクロール領域からはみ出さないよう、この枠内で切り取る。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-muted/40" />
        <div className="absolute -left-24 top-1/4 size-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-16 bottom-1/4 size-80 rounded-full bg-secondary blur-3xl" />
      </div>

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

        {currentUserId ? (
          <ReturnRoomSection currentUserId={currentUserId} />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <CreateRoomSection currentUserId={currentUserId} />
          <JoinRoomSection currentUserId={currentUserId} />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          作成の再試行は24時間以内です。控えはこのブラウザで復元します。保存を消した場合や別の端末では、同じ作成を見つけられないことがあります。
        </p>
        <nav
          aria-label="過去の成果"
          className="flex justify-end border-t border-border/60 pt-2"
        >
          <Link
            href="/completed-rooms"
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span className="underline underline-offset-4">
              過去の成果を見る
            </span>
            <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        </nav>
      </div>
    </div>
  );
}
