import Image from "next/image";
import Link from "next/link";
import {
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
            <span>
              {character.text.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
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
        <div className="mt-6">
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
