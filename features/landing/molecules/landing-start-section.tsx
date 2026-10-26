import { landingCopy as copy } from "../logic/landing-copy";
import {
  landingHeadingClass,
  landingSectionClass,
} from "../logic/landing-styles";
import styles from "./landing.module.css";

export function LandingStartSection() {
  return (
    <section
      className={`${styles.theme} ${landingSectionClass}`}
      aria-labelledby="landing-start"
    >
      <h2 id="landing-start" className={landingHeadingClass}>
        {copy.gettingStarted.heading}
      </h2>
      <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {copy.gettingStarted.steps.map((step, index) => (
          <li key={step.title}>
            <p className="mb-3 text-sm font-semibold tabular-nums text-[var(--lp-accent-hover)]">
              {index + 1}
            </p>
            <h3 className="text-2xl font-bold leading-8">{step.title}</h3>
            <p className="mt-2 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-8 max-w-3xl text-base leading-8 sm:text-lg text-[var(--lp-body)]">
        {copy.gettingStarted.invited}
      </p>
    </section>
  );
}
