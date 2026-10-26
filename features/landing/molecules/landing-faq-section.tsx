import {
  landingCopy as copy,
  LANDING_CONTACT_URL,
} from "../logic/landing-copy";
import {
  landingHeadingClass,
  landingLinkClass,
  landingSectionClass,
} from "../logic/landing-styles";
import styles from "./landing.module.css";

export function LandingFaqSection() {
  return (
    <section
      className={`${styles.theme} ${landingSectionClass}`}
      aria-labelledby="landing-faq"
    >
      <h2 id="landing-faq" className={landingHeadingClass}>
        {copy.faq.heading.map((phrase) => (
          <span key={phrase} className="inline-block">
            {phrase}
          </span>
        ))}
      </h2>
      <div className="mt-8 max-w-3xl divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)]">
        {copy.faq.items.map((item) => (
          <details key={item.question} className="py-1">
            <summary className="cursor-pointer py-4 pr-2 text-base sm:text-lg font-semibold leading-8 hover:text-[var(--lp-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]">
              {item.question}
            </summary>
            <div className="pb-5 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
              <p>{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
      <p className="mt-8 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
        {copy.faq.contactHelp}
      </p>
      <a
        href={LANDING_CONTACT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={landingLinkClass}
      >
        {copy.faq.contact}
      </a>
    </section>
  );
}
