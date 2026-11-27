import Image from "next/image";
import Link from "next/link";
import styles from "./landing.module.css";

/** 解説ページの共通の枠。LP と同じ色とブランドの見出しで、本文は読みやすい幅に収める。 */
export function GuidePage({ children }: { children: React.ReactNode }) {
  return (
    <main
      lang="ja"
      className={`${styles.theme} min-h-0 flex-1 overflow-y-auto bg-[var(--lp-surface)] text-[var(--lp-ink)] selection:bg-[var(--lp-tint)] [color-scheme:light]`}
    >
      <header className="mx-auto max-w-3xl px-6 py-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-lg font-bold tracking-tight text-[var(--lp-accent)]"
        >
          <Image
            src="/brand/ideaboost-icon-96.png"
            width={32}
            height={32}
            alt=""
            unoptimized
          />
          Idea Boost
        </Link>
      </header>
      <div className="mx-auto max-w-3xl px-6 pb-20 pt-4">{children}</div>
    </main>
  );
}
