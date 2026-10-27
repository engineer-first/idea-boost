import { landingCopy as copy } from "../logic/landing-copy";
import {
  landingHeadingClass,
  landingSectionClass,
} from "../logic/landing-styles";
import styles from "./landing.module.css";
import { LandingFeatureDemo } from "./landing-feature-demo";

export function LandingFeaturesSection() {
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
              <LandingFeatureDemo index={index} />
              <h3 className="mt-5 text-xl font-bold">{item.title}</h3>
              <p className="mt-3 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
                {item.description}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
