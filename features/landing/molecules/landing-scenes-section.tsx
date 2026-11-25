import {
  Download,
  Lightbulb,
  LockKeyhole,
  MessagesSquare,
  Star,
  Users,
} from "lucide-react";
import { Fragment } from "react";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";

import {
  landingHeadingClass,
  landingLinkClass,
  landingPaperStyle,
} from "../logic/landing-styles";
import styles from "./landing.module.css";

/** 集まる・書く・持ち寄る・広げる・選ぶ・持ち帰る の順に対応する。 */
const icons = [Users, LockKeyhole, MessagesSquare, Lightbulb, Star, Download];

/** 使う前と後の変化を、ルームで過ごす6つの場面で伝える（#1128）。 */
export function LandingScenesSection({
  locale = "ja",
}: {
  locale?: AppLocale;
}) {
  const { scenes } = getLandingContent(locale).landingCopy;
  return (
    <section
      style={landingPaperStyle}
      className={`${styles.theme} ${styles.scenes}`}
      aria-labelledby="landing-scenes"
    >
      <div className={styles.sceneShapes} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <h2 id="landing-scenes" className={landingHeadingClass}>
        {scenes.heading.map((phrase, index) => (
          <Fragment key={phrase}>
            {locale === "en" && index > 0 ? " " : null}
            <span className={styles.marker}>{phrase}</span>
          </Fragment>
        ))}
      </h2>
      <ol className={styles.sceneGrid}>
        {scenes.items.map((item, index) => {
          const Icon = icons[index];
          return (
            <li key={item.title} className={styles.scene}>
              <p className={styles.eyebrow}>
                <Icon size={20} aria-hidden="true" />
                {index + 1}
              </p>
              <h3 className={styles.sceneHeading}>{item.title}</h3>
              <p className="mt-3 text-base leading-8 text-[var(--lp-body)]">
                {item.description}
              </p>
              {"evidence" in item && item.evidence ? (
                <>
                  <p className="mt-4 text-sm leading-7 text-[var(--lp-body)]">
                    {item.evidence}
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${landingLinkClass} mt-1`}
                  >
                    {item.source}
                  </a>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
