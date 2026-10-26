import Image from "next/image";
import Link from "next/link";
import {
  landingBoardCopy,
  landingMoodCharacters,
  landingMoodPrompt,
} from "../logic/landing-board-copy";
import { landingCopy as copy } from "../logic/landing-copy";
import type { LandingEntry } from "../logic/landing-entry";
import { landingCtaClass, landingLinkClass } from "../logic/landing-styles";
import styles from "./landing.module.css";
import { LandingDemo } from "./landing-demo";

export function LandingHeroSection({ entry }: { entry: LandingEntry }) {
  return (
    <section
      className={`${styles.theme} ${styles.hero}`}
      aria-labelledby="landing-heading"
    >
      <div className={styles.heroMood} aria-hidden="true">
        {landingMoodCharacters.map((character) => (
          <div
            key={character.id}
            className={`${styles.moodCharacter} ${styles[`character${character.id}`]}`}
          >
            <Image
              src={`/landing/mood-${character.id}.webp`}
              width={400}
              height={400}
              alt=""
              unoptimized
            />
            {character.text.length > 0 && (
              <span>
                {character.text.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            )}
          </div>
        ))}
        <p className={styles.moodPrompt}>{landingMoodPrompt}</p>
        <i className={styles.moodTriangle} />
        <i className={styles.moodArc} />
      </div>
      <div className={styles.heroContent}>
        <p className="mb-2 text-sm font-medium text-[var(--lp-body)]">
          {copy.introduction}
        </p>
        <h1 id="landing-heading" className={styles.heroHeading}>
          {copy.heading.map((phrase) => (
            <span key={phrase} className="block">
              {phrase.includes(copy.headingAccent) ? (
                <>
                  <span className={styles.marker}>{copy.headingAccent}</span>
                  {phrase.slice(copy.headingAccent.length)}
                </>
              ) : (
                phrase
              )}
            </span>
          ))}
        </h1>
        <p className={styles.heroSubheading}>
          {copy.subheading.map((phrase) => (
            <span key={phrase} className="inline-block">
              {phrase}
            </span>
          ))}
        </p>
        <div className={styles.comparisons}>
          <div className={styles.comparison}>
            <p className={styles.comparisonLabel}>
              <span className={styles.comparisonSubject}>
                {copy.comparison.subject}
              </span>
              {copy.comparison.timeLabel}
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
                <span>{copy.comparison.timeBefore}</span>
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
                  <span>{copy.comparison.afterLabel}</span>
                  <strong>{copy.comparison.timeAfter}</strong>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.comparison}>
            <p className={styles.comparisonLabel}>
              <span className={styles.comparisonSubject}>
                {copy.comparison.subject}
              </span>
              {copy.comparison.guideLabel}
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
                <span>{copy.comparison.guideBefore}</span>
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
                  <span>{copy.comparison.afterLabel}</span>
                  <strong>{copy.comparison.guideAfter}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className={styles.comparisonNote}>
          <a href="#landing-duration">
            {copy.comparison.timeNote.map((phrase) => (
              <span key={phrase} className="inline-block">
                {phrase}
              </span>
            ))}
          </a>
        </p>
        <div className="mt-3">
          <Link
            href={entry.href}
            className={`${landingCtaClass} ${styles.heroCta}`}
          >
            {entry.label}
          </Link>
        </div>
        {entry.showStartHelp && (
          <div className={styles.heroHelp}>
            <Link href={entry.href} className={landingLinkClass}>
              {copy.join}
            </Link>
          </div>
        )}
      </div>
      <LandingDemo />
    </section>
  );
}
