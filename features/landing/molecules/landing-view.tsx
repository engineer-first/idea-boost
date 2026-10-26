import Image from "next/image";
import Link from "next/link";
import { landingCopy as copy } from "../logic/landing-copy";
import type { LandingEntry } from "../logic/landing-entry";
import {
  landingCtaClass,
  landingHeadingClass,
  landingLinkClass,
} from "../logic/landing-styles";
import styles from "./landing.module.css";
import { LandingFaqSection } from "./landing-faq-section";
import { LandingFeaturesSection } from "./landing-features-section";
import { LandingFlowSection } from "./landing-flow-section";
import { LandingHeroSection } from "./landing-hero-section";
import { LandingMethodSection } from "./landing-method-section";
import { LandingStartSection } from "./landing-start-section";

export type LandingViewProps = { isLoggedIn: boolean; entry: LandingEntry };

export function LandingView({ isLoggedIn, entry }: LandingViewProps) {
  return (
    <main
      className={`${styles.theme} min-h-0 flex-1 overflow-y-auto bg-[var(--lp-surface)] text-[var(--lp-ink)] selection:bg-[var(--lp-tint)] [color-scheme:light]`}
      data-testid="landing-scroll"
    >
      {!isLoggedIn && (
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2 sm:px-10">
          <p className="text-lg font-bold tracking-tight text-[var(--lp-accent)]">
            {copy.brand}
          </p>
          <Link href={entry.href} className={landingLinkClass}>
            {copy.login}
          </Link>
        </header>
      )}
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <LandingHeroSection entry={entry} />
      </div>
      <div className={styles.sloganBand}>
        <p>
          {copy.moodSlogan.map((phrase) => (
            <span key={phrase} className={styles.marker}>
              {phrase}
            </span>
          ))}
        </p>
      </div>
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <LandingMethodSection />
        <LandingFeaturesSection />
        <LandingFlowSection />
        <LandingStartSection />
        <LandingFaqSection />
      </div>
      <footer>
        <div className={styles.closingBand}>
          <div className={styles.closingInner}>
            <div>
              <h2 className={`${landingHeadingClass} mb-6`}>
                {copy.closing.map((phrase) => (
                  <span key={phrase} className="block">
                    {phrase}
                  </span>
                ))}
              </h2>
              <Link href={entry.href} className={landingCtaClass}>
                {entry.label}
              </Link>
            </div>
            <Image
              className={styles.celebration}
              src="/landing/mood-e.webp"
              width={800}
              height={533}
              alt=""
              aria-hidden="true"
              unoptimized
            />
            <i className={styles.moodTriangle} aria-hidden="true" />
            <i className={styles.moodArc} aria-hidden="true" />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
          <Link href="/privacy" className={landingLinkClass}>
            {copy.privacy}
          </Link>
          <p className="mt-6 max-w-3xl text-xs leading-6 text-[var(--lp-body)]">
            {copy.disclaimer}
          </p>
        </div>
      </footer>
    </main>
  );
}
