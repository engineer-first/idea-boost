import { EyeOff, Lightbulb, Users } from "lucide-react";
import Image from "next/image";
import { landingCopy as copy } from "../logic/landing-copy";
import { landingHeadingClass, landingLinkClass } from "../logic/landing-styles";
import styles from "./landing.module.css";
import { LandingBoardMock } from "./landing-board-mock";

const visuals = ["issue", "private", "vote"] as const;
const characters = ["b", "c", "d"] as const;
const icons = [Lightbulb, Users, EyeOff];
export function LandingMethodSection() {
  return (
    <section
      className={`${styles.theme} ${styles.method}`}
      aria-labelledby="landing-method"
    >
      <div className={styles.methodShapes} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={styles.methodIntro}>
        <h2 id="landing-method" className={landingHeadingClass}>
          {copy.method.heading.map((phrase) => (
            <span key={phrase} className={styles.marker}>
              {phrase}
            </span>
          ))}
        </h2>
        <p className="mt-6 text-xl font-bold sm:text-2xl">
          {copy.method.introduction}
        </p>
        <p className="mt-4 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
          {copy.method.description}
        </p>
        <a
          href={copy.method.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={landingLinkClass}
        >
          {copy.method.source}
        </a>
      </div>
      {copy.method.principles.map((item, index) => {
        const Icon = icons[index];
        return (
          <article key={item.title} className={styles.reason}>
            <div className={styles.reasonVisual}>
              <LandingBoardMock variant={visuals[index]} />
              <Image
                className={styles.reasonCharacter}
                src={`/landing/mood-${characters[index]}.webp`}
                width={100}
                height={100}
                alt=""
                aria-hidden="true"
                unoptimized
              />
            </div>
            <div className={styles.reasonText}>
              <p className={styles.eyebrow}>
                <Icon size={20} />
                {item.label}
              </p>
              <h3 className={styles.reasonHeading}>
                {item.title}
                <br />
                <span className={styles.marker}>{item.accent}</span>
              </h3>
              <p className="mt-6 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
                {item.description}
              </p>
              <p className="mt-6 text-base leading-7 text-[var(--lp-body)]">
                {item.evidence}
              </p>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${landingLinkClass} mt-2`}
              >
                {item.source}
              </a>
            </div>
          </article>
        );
      })}
      <div className={styles.methodOutro}>
        <p className="mt-5 text-base font-semibold leading-8 sm:text-lg">
          {copy.method.scope}
        </p>
        <p className="mt-4 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
          {copy.method.cases}
        </p>
        <a
          href={copy.method.casesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={landingLinkClass}
        >
          {copy.method.casesLabel}
        </a>
      </div>
    </section>
  );
}
