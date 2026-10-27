import { Heart, MousePointer2, Scale } from "lucide-react";
import type { CSSProperties } from "react";
import { landingBoardCopy, landingMembers } from "../logic/landing-board-copy";
import { landingCopy as copy } from "../logic/landing-copy";
import styles from "./landing.module.css";
import { LandingBoardMock } from "./landing-board-mock";

export function LandingDemo() {
  const cursorClasses = [
    styles.cursorOne,
    styles.cursorTwo,
    styles.cursorThree,
  ];
  return (
    <figure className={`${styles.theme} ${styles.demo}`}>
      <div className={styles.board}>
        <LandingBoardMock variant="hero" />
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
              <div
                key={line}
                className={index === 0 ? styles.typingOne : styles.typingTwo}
              >
                {line}
              </div>
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
            <Heart fill="currentColor" />
          </span>
          <span className={`${styles.vote} ${styles.centerObjective}`}>
            <Scale />
          </span>
          <span className={`${styles.vote} ${styles.outerObjectiveOne}`}>
            <Scale />
          </span>
          <span className={`${styles.vote} ${styles.outerObjectiveTwo}`}>
            <Scale />
          </span>
          <div className={styles.voteTray}>
            <span>
              <Heart size={18} />
              {landingBoardCopy.subjective}
              <span className={styles.subjectiveCount} />
            </span>
            <span>
              <Scale size={18} />
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
