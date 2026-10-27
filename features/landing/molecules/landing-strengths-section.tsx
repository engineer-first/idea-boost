import Image from "next/image";
import { landingBoardCopy } from "../logic/landing-board-copy";
import { landingCopy as copy } from "../logic/landing-copy";
import { landingHeadingClass } from "../logic/landing-styles";
import styles from "./landing.module.css";

export function LandingStrengthsSection() {
  return (
    <section
      className={`${styles.theme} ${styles.strengths}`}
      aria-labelledby="landing-strengths"
    >
      <h2 id="landing-strengths" className={landingHeadingClass}>
        {copy.comparison.heading.map((phrase) => (
          <span key={phrase} className={`inline-block ${styles.marker}`}>
            {phrase}
          </span>
        ))}
      </h2>
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
          <p className={styles.comparisonNote}>
            <a href="#landing-duration">
              {copy.comparison.timeNote.map((phrase) => (
                <span key={phrase} className="inline-block">
                  {phrase}
                </span>
              ))}
            </a>
          </p>
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
    </section>
  );
}
