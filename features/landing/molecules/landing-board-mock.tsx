import { Timer } from "lucide-react";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";

import { landingPaperStyle } from "../logic/landing-styles";
import styles from "./landing.module.css";

/** ヒーローに置く、ルームのボードの見本。 */
export function LandingBoardMock({ locale = "ja" }: { locale?: AppLocale }) {
  const { landingBoardCopy, landingMembers } = getLandingContent(locale);
  return (
    <div
      style={landingPaperStyle}
      className={`${styles.theme} ${styles.mock} ${styles.heroMock}`}
      aria-hidden="true"
    >
      <div className={styles.mockHeader}>
        <div className={styles.mockProgress}>
          <strong>{landingBoardCopy.header}</strong>
          <div className={styles.progressRail} />
          <small>{landingBoardCopy.room}</small>
        </div>
        <div className={styles.mockControls}>
          <div className={styles.mockAvatars}>
            {landingMembers.map((member) => (
              <span
                key={member.name}
                style={{
                  backgroundColor: `var(--lp-note-${member.color})`,
                }}
              >
                {member.initial}
              </span>
            ))}
          </div>
          <span className={styles.mockTimer}>
            <Timer />
            {landingBoardCopy.timer}
          </span>
          <span className={styles.mockNext}>{landingBoardCopy.next}</span>
        </div>
      </div>
      {landingBoardCopy.hero.map((note, index) => (
        <div
          key={note.text}
          style={{
            backgroundColor: `var(--lp-note-${landingMembers[note.member].color})`,
          }}
          className={`${styles.mockNote} ${styles[`note${index}`]}`}
        >
          {note.text}
        </div>
      ))}
    </div>
  );
}
