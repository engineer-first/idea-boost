// ホーム画面の template（アトミックデザイン: pages 層は使わない）。
// Server Action や認証は app/home/page.tsx の責務。
// アプリ名 Idea Boost は root layout の AppHeader のみが担う。
//
// UX: 作成を主役にし、招待コードによる参加をすぐ下の段で案内する。

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { type AccountLinkResult, AccountLinkSection } from "@/features/auth";
import {
  CreateRoomSection,
  JoinRoomSection,
  ReturnRoomSection,
} from "@/features/room-lifecycle";
import { HomeErrorAlert } from "./home-error-alert";
import styles from "./home-view.module.css";

export type HomeViewProps = {
  error?: string;
  currentUserId: string;
  accountLinkStatus: "guest" | "linked";
  accountLinkResult?: AccountLinkResult;
};

export function HomeView({
  error,
  currentUserId,
  accountLinkStatus,
  accountLinkResult,
}: HomeViewProps) {
  return (
    <div className={styles.home} data-testid="home-view">
      <div aria-hidden className={styles.art} />
      <div className={styles.content}>
        {error ? <HomeErrorAlert message={error} /> : null}
        <ReturnRoomSection currentUserId={currentUserId} />
        <div className={styles.hero}>
          <header className={styles.intro}>
            <h1>
              <span>そのひらめき、</span>
              <span>みんなで育てよう。</span>
            </h1>
            <p>ルームを作って、仲間とアイデア出しを始めましょう。</p>
          </header>
          <CreateRoomSection currentUserId={currentUserId} />
        </div>
        <JoinRoomSection />
        <nav aria-label="過去の成果" className={styles.history}>
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
        <AccountLinkSection
          status={accountLinkStatus}
          next="/home"
          result={accountLinkResult}
        />
      </div>
    </div>
  );
}
