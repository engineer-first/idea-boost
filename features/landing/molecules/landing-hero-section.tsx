import { Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";

import type { LandingEntry } from "../logic/landing-entry";
import { landingCtaClass } from "../logic/landing-styles";
import styles from "./landing.module.css";
import { LandingCodeEntry } from "./landing-code-entry";
import { LandingDemo } from "./landing-demo";

export function LandingHeroSection({
  entry,
  locale = "ja",
}: {
  entry: LandingEntry;
  locale?: AppLocale;
}) {
  const {
    landingCopy: copy,
    landingMoodCharacters,
    landingMoodPrompt,
  } = getLandingContent(locale);
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
              {character.text.map((line, index) => (
                <Fragment key={line}>
                  {locale === "en" && index > 0 ? " " : null}
                  <span>{line}</span>
                </Fragment>
              ))}
            </span>
          </div>
        ))}
        <p className={styles.moodPrompt}>{landingMoodPrompt}</p>
        <i className={styles.moodTriangle} />
        <i className={styles.moodArc} />
      </div>
      <div className={styles.heroContent}>
        <p className="mb-2 text-base font-medium text-[var(--lp-body)]">
          {copy.introduction}
        </p>
        <h1 id="landing-heading" className={styles.heroHeading}>
          {copy.heading.map((phrase, index) => (
            <Fragment key={phrase}>
              {locale === "en" && index > 0 ? " " : null}
              <span className="block">
                {phrase.includes(copy.headingAccent) ? (
                  <>
                    <span className={styles.marker}>{copy.headingAccent}</span>
                    {phrase.slice(copy.headingAccent.length)}
                  </>
                ) : (
                  phrase
                )}
              </span>
            </Fragment>
          ))}
        </h1>
        <p className={styles.heroSubheading}>
          {copy.subheading.map((phrase, index) => (
            <Fragment key={phrase}>
              {locale === "en" && index > 0 ? " " : null}
              <span className="inline-block">{phrase}</span>
            </Fragment>
          ))}
        </p>
        <ul className={styles.heroPromises} aria-label={copy.promisesLabel}>
          {copy.promises.map((promise) => (
            <li key={promise}>
              <Check size={18} aria-hidden="true" />
              {promise}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Link
            href={entry.href}
            className={`${landingCtaClass} ${styles.heroCta}`}
          >
            {entry.label}
          </Link>
        </div>
        <p className={styles.heroNote}>
          {copy.heroNote.text}
          {locale === "en" ? " " : null}
          <a href="#landing-duration">{copy.heroNote.median}</a>
        </p>
        {entry.showCodeEntry && <LandingCodeEntry locale={locale} />}
      </div>
      <LandingDemo locale={locale} />
    </section>
  );
}
