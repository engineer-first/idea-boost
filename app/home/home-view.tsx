// ホーム画面の template（アトミックデザイン: pages 層は使わない）。
// Server Action や認証は app/home/page.tsx の責務。
// アプリ名 Idea Boost は root layout の AppHeader のみが担う。
//
// UX: 2 つの明確な入口（作成 / 参加）を並列に置き、視線誘導と行動の選択を最短にする。

import { CreateRoomSection, JoinRoomSection } from "@/features/room-lifecycle";
import { HomeErrorAlert } from "./home-error-alert";

export type HomeViewProps = {
  error?: string;
};

export function HomeView({ error }: HomeViewProps) {
  return (
    <div
      className="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-6"
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

      <div className="relative z-10 flex w-full max-w-2xl flex-col gap-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Design Sprintを始めましょう
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
      </div>
    </div>
  );
}
