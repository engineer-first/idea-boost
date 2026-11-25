import { MousePointer2, Star, Users } from "lucide-react";
import { type CSSProperties, Fragment } from "react";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";

import { landingPaperStyle } from "../logic/landing-styles";
import styles from "./landing.module.css";
import { LandingBoardMock } from "./landing-board-mock";

export function LandingDemo({ locale = "ja" }: { locale?: AppLocale }) {
  const { landingBoardCopy, landingMembers } = getLandingContent(locale);
  const copy = getLandingContent(locale).landingCopy;
  const cursorClasses = [
    styles.cursorOne,
    styles.cursorTwo,
    styles.cursorThree,
  ];
  return (
    <figure
      style={landingPaperStyle}
      className={`${styles.theme} ${styles.demo}`}
    >
      <div className={styles.board}>
        <LandingBoardMock locale={locale} />
        <div
          data-testid="landing-demo-decoration"
          aria-hidden="true"
          className={styles.decoration}
        >
          <div
            style={{
              backgroundColor: `var(--lp-note-${landingMembers[0].color})`,
            }}
            className={`${styles.demoNote} ${styles.typedNote}`}
          >
            {copy.demo.typing.map((line, index) => (
              <Fragment key={line}>
                {locale === "en" && index > 0 ? " " : null}
                <div
                  className={index === 0 ? styles.typingOne : styles.typingTwo}
                >
                  {line}
                </div>
              </Fragment>
            ))}
          </div>
          <div
            style={{
              backgroundColor: `var(--lp-note-${landingMembers[2].color})`,
            }}
            className={`${styles.demoNote} ${styles.newNote}`}
          >
            {copy.demo.note}
          </div>
          <span className={`${styles.vote} ${styles.centerSubjective}`}>
            <Star />
          </span>
          <span className={`${styles.vote} ${styles.centerObjective}`}>
            <Users />
          </span>
          <span className={`${styles.vote} ${styles.outerObjectiveOne}`}>
            <Users />
          </span>
          <span className={`${styles.vote} ${styles.outerObjectiveTwo}`}>
            <Users />
          </span>
          <div className={styles.voteTray}>
            <span>
              <Star size={18} />
              {landingBoardCopy.subjective}
              <span className={styles.subjectiveCount} />
            </span>
            <span>
              <Users size={18} />
              {landingBoardCopy.objective}
              <span className={styles.objectiveCount} />
            </span>
          </div>
          {landingMembers.map((member, index) => (
            <div
              key={member.name}
              style={
                {
                  "--member-color": `var(--lp-note-${member.color})`,
                } as CSSProperties
              }
              className={`${styles.cursor} ${cursorClasses[index]}`}
            >
              <MousePointer2 fill="currentColor" />
              <span>{member.name}</span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
