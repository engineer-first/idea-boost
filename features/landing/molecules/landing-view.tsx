import Link from "next/link";
import { landingCopy as copy } from "../logic/landing-copy";
import type { LandingEntry } from "../logic/landing-entry";
import {
  landingCtaClass,
  landingHeadingClass,
  landingLinkClass,
  landingSectionClass,
} from "../logic/landing-styles";
import { LandingFaqSection } from "./landing-faq-section";
import { LandingFlowSection } from "./landing-flow-section";
import { LandingHeroSection } from "./landing-hero-section";
import { LandingMethodSection } from "./landing-method-section";
import { LandingStartSection } from "./landing-start-section";

export type LandingViewProps = { isLoggedIn: boolean; entry: LandingEntry };

export function LandingView({ isLoggedIn, entry }: LandingViewProps) {
  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto bg-slate-50 text-slate-900 selection:bg-indigo-100 [color-scheme:light]"
      data-testid="landing-scroll"
    >
      {!isLoggedIn && (
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 sm:px-10">
          <p className="text-lg font-bold tracking-tight text-indigo-600">
            {copy.brand}
          </p>
          <Link href={entry.href} className={landingLinkClass}>
            {copy.login}
          </Link>
        </header>
      )}
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <LandingHeroSection entry={entry} />
        <LandingFlowSection />
        <LandingMethodSection />
        <LandingStartSection />
        <LandingFaqSection />
        <footer className={landingSectionClass}>
          <h2 className={`${landingHeadingClass} mb-6`}>
            {copy.closing.map((phrase) => (
              <span key={phrase} className="inline-block">
                {phrase}
              </span>
            ))}
          </h2>
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <Link href={entry.href} className={landingCtaClass}>
              {entry.label}
            </Link>
            <Link href="/privacy" className={landingLinkClass}>
              {copy.privacy}
            </Link>
          </div>
          <p className="mt-8 max-w-3xl text-xs leading-6 text-slate-600">
            {copy.disclaimer}
          </p>
        </footer>
      </div>
    </main>
  );
}
