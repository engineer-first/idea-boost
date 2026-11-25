import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";
import { LANDING_CONTACT_URL } from "../logic/landing-copy";
import type { LandingEntry } from "../logic/landing-entry";
import { LANDING_PATHS } from "../logic/landing-metadata";
import {
  getLandingStructuredData,
  serializeStructuredData,
} from "../logic/landing-structured-data";
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
import { LandingStrengthsSection } from "./landing-strengths-section";

export type LandingViewProps = {
  isLoggedIn: boolean;
  entry: LandingEntry;
  locale: AppLocale;
  /** ブラウザが望む言語。表示中と違うときだけ、その言語の版への案内を出す。 */
  browserLocale?: AppLocale;
};

export function LandingView({
  isLoggedIn,
  entry,
  locale,
  browserLocale = locale,
}: LandingViewProps) {
  const copy = getLandingContent(locale).landingCopy;
  const otherLanguage =
    browserLocale === locale
      ? null
      : {
          locale: browserLocale,
          href: LANDING_PATHS[browserLocale],
          label: getLandingContent(browserLocale).landingCopy.languageVersion,
        };
  return (
    <main
      lang={locale}
      className={`${styles.theme} min-h-0 flex-1 overflow-y-auto bg-[var(--lp-surface)] text-[var(--lp-ink)] selection:bg-[var(--lp-tint)] [color-scheme:light]`}
      data-testid="landing-scroll"
    >
      <script
        type="application/ld+json"
        // 自前の固定文言だけを、< を逃がした JSON で埋め込む（Next.js の JSON-LD ガイドの形）。
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 構造化データは実行しない JSON
        dangerouslySetInnerHTML={{
          __html: serializeStructuredData(getLandingStructuredData(locale)),
        }}
      />
      {!isLoggedIn && (
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2 sm:px-10">
          <p className="flex items-center gap-2 text-lg font-bold tracking-tight text-[var(--lp-accent)]">
            <Image
              src="/brand/ideaboost-icon-96.png"
              width={32}
              height={32}
              alt=""
              unoptimized
            />
            {copy.brand}
          </p>
          <div className="flex shrink-0 items-center gap-4 whitespace-nowrap sm:gap-6">
            {otherLanguage && (
              <Link
                href={otherLanguage.href}
                hrefLang={otherLanguage.locale}
                lang={otherLanguage.locale}
                className={landingLinkClass}
              >
                {otherLanguage.label}
              </Link>
            )}
            <Link href={entry.loginHref} className={landingLinkClass}>
              {copy.login}
            </Link>
          </div>
        </header>
      )}
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <LandingHeroSection locale={locale} entry={entry} />
      </div>
      <div className={styles.sloganBand}>
        <p>
          {copy.moodSlogan.map((phrase, index) => (
            <Fragment key={phrase}>
              {locale === "en" && index > 0 ? " " : null}
              <span className={styles.marker}>{phrase}</span>
            </Fragment>
          ))}
        </p>
      </div>
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <LandingStrengthsSection locale={locale} />
        <LandingMethodSection locale={locale} />
        <LandingFeaturesSection locale={locale} />
        <LandingFlowSection locale={locale} />
        <LandingStartSection locale={locale} entry={entry} />
        <LandingFaqSection locale={locale} />
      </div>
      <footer>
        <div className={styles.closingBand}>
          <div className={styles.closingInner}>
            <div>
              <h2 className={`${landingHeadingClass} mb-6`}>
                {copy.closing.map((phrase, index) => (
                  <Fragment key={phrase}>
                    {locale === "en" && index > 0 ? " " : null}
                    <span className="block">{phrase}</span>
                  </Fragment>
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
          <nav aria-label={copy.footerNav}>
            <ul className="flex flex-wrap gap-x-8 gap-y-2">
              <li>
                <Link href="/privacy" className={landingLinkClass}>
                  {copy.privacy}
                </Link>
              </li>
              <li>
                <a
                  href={LANDING_CONTACT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={landingLinkClass}
                >
                  {copy.contact}
                </a>
              </li>
            </ul>
          </nav>
          <p className="mt-6 max-w-3xl text-xs leading-6 text-[var(--lp-body)]">
            {copy.disclaimer}
          </p>
        </div>
      </footer>
    </main>
  );
}
