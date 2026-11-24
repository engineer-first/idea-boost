import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";

import {
  landingHeadingClass,
  landingSectionClass,
} from "../logic/landing-styles";
import styles from "./landing.module.css";
import { LandingFeatureDemo } from "./landing-feature-demo";

export function LandingFeaturesSection({
  locale = "ja",
}: {
  locale?: AppLocale;
}) {
  const copy = getLandingContent(locale).landingCopy;
  return (
    <section
      className={`${styles.theme} ${landingSectionClass}`}
      aria-labelledby="landing-features"
    >
      <h2 id="landing-features" className={landingHeadingClass}>
        <span className={styles.marker}>{copy.features.heading}</span>
      </h2>
      <div className={styles.featureGrid}>
        {copy.features.items.map((item, index) => {
          return (
            <article key={item.title}>
              <LandingFeatureDemo index={index} locale={locale} />
              <h3 className="mt-5 text-xl font-bold">{item.title}</h3>
              <p className="mt-3 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
                {item.description}
              </p>
              {"note" in item ? (
                <p className="mt-2 text-xs leading-6 text-[var(--lp-body)]">
                  {item.note}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
