import Link from "next/link";
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
      <div className="relative z-10 text-center">
        <p className="mb-3 text-base font-medium text-[var(--lp-body)]">
          {copy.introduction}
        </p>
        <h1 id="landing-heading" className={styles.heroHeading}>
          {copy.heading.map((phrase) => (
            <span key={phrase} className="block">
              {phrase}
            </span>
          ))}
        </h1>
        <p className="mt-5 text-balance text-2xl font-bold leading-snug sm:text-3xl">
          {copy.subheading.split("、").map((phrase, index) => (
            <span key={phrase} className="inline-block">
              {phrase}
              {index === 0 ? "、" : ""}
            </span>
          ))}
        </p>
        <p className="mt-4 text-lg font-semibold leading-relaxed text-[var(--lp-accent)]">
          {copy.origin.map((phrase) => (
            <span key={phrase} className="inline-block">
              {phrase}
            </span>
          ))}
        </p>
        <div className="mt-6">
          <Link href={entry.href} className={landingCtaClass}>
            {entry.label}
          </Link>
        </div>
        {entry.showStartHelp && (
          <div className="mt-3">
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
