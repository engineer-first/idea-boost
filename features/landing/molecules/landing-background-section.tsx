import Image from "next/image";
import { Fragment } from "react";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";

import { landingHeadingClass, landingLinkClass } from "../logic/landing-styles";
import styles from "./landing.module.css";

/** 手法の名前と出典は、裏づけとしてここ（とよくある質問）にだけ置く（#1128）。 */
export function LandingBackgroundSection({
  locale = "ja",
}: {
  locale?: AppLocale;
}) {
  const { landingBoardCopy, landingCopy } = getLandingContent(locale);
  const background = landingCopy.background;
  const comparison = background.comparison;
  return (
    <section
      className={`${styles.theme} ${styles.strengths}`}
      aria-labelledby="landing-background"
    >
      <h2 id="landing-background" className={landingHeadingClass}>
        <span className={styles.marker}>{background.heading}</span>
      </h2>
      <p className="mt-6 max-w-3xl text-base leading-8 sm:text-lg text-[var(--lp-body)]">
        {background.description}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-8">
        <li>
          <a
            href={background.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={landingLinkClass}
          >
            {background.source}
          </a>
        </li>
        <li>
          <a
            href={background.voteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={landingLinkClass}
          >
            {background.voteSource}
          </a>
        </li>
      </ul>
      <div className={styles.comparisons}>
        <div className={styles.comparison}>
          <p className={styles.comparisonLabel}>
            <span className={styles.comparisonSubject}>
              {comparison.subject}
            </span>
            {locale === "en" ? " " : null}
            {comparison.timeLabel}
          </p>
          <div className={styles.comparisonContent}>
            <div className={styles.comparisonBefore}>
              <Image
                className={styles.comparisonIllustration}
                src="/landing/mood-f.webp"
                width={180}
                height={89}
                alt=""
                aria-hidden="true"
                unoptimized
              />
              <span>{comparison.timeBefore}</span>
            </div>
            <span className={styles.comparisonArrow} aria-hidden="true">
              →
            </span>
            <div className={styles.comparisonAfter}>
              <div
                className={`${styles.pieTimer} ${styles.miniTimer}`}
                aria-hidden="true"
              >
                <span />
              </div>
              <div className={styles.afterWords}>
                <span>{comparison.afterLabel}</span>
                <strong>{comparison.timeAfter}</strong>
              </div>
            </div>
          </div>
          <p className={styles.comparisonNote}>
            <a href="#landing-duration">
              {comparison.timeNote.map((phrase, index) => (
                <Fragment key={phrase}>
                  {locale === "en" && index > 0 ? " " : null}
                  <span className="inline-block">{phrase}</span>
                </Fragment>
              ))}
            </a>
          </p>
        </div>
        <div className={styles.comparison}>
          <p className={styles.comparisonLabel}>
            <span className={styles.comparisonSubject}>
              {comparison.subject}
            </span>
            {locale === "en" ? " " : null}
            {comparison.guideLabel}
          </p>
          <div className={styles.comparisonContent}>
            <div className={styles.comparisonBefore}>
              <Image
                className={styles.comparisonIllustration}
                src="/landing/mood-g.webp"
                width={180}
                height={173}
                alt=""
                aria-hidden="true"
                unoptimized
              />
              <span>{comparison.guideBefore}</span>
            </div>
            <span className={styles.comparisonArrow} aria-hidden="true">
              →
            </span>
            <div className={styles.comparisonAfter}>
              <div className={styles.miniProgress} aria-hidden="true">
                <span>{landingBoardCopy.header}</span>
                <i />
              </div>
              <div className={styles.afterWords}>
                <span>{comparison.afterLabel}</span>
                <strong>{comparison.guideAfter}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-8 max-w-3xl text-base font-semibold leading-8 sm:text-lg">
        {background.scope}
      </p>
      <p className="mt-4 max-w-3xl text-base leading-8 sm:text-lg text-[var(--lp-body)]">
        {background.cases}
      </p>
      <a
        href={background.casesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={landingLinkClass}
      >
        {background.casesLabel}
      </a>
    </section>
  );
}
