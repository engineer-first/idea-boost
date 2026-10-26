import {
  ArrowRight,
  EyeOff,
  Heart,
  LockKeyhole,
  Timer,
  Users,
} from "lucide-react";
import { landingBoardCopy, landingMembers } from "../logic/landing-board-copy";
import styles from "./landing.module.css";

export type LandingBoardMockProps = {
  variant: "hero" | "issue" | "private" | "vote";
};

export function LandingBoardMock({ variant }: LandingBoardMockProps) {
  return (
    <div
      className={`${styles.theme} ${styles.mock} ${styles[`${variant}Mock`]}`}
      aria-hidden="true"
    >
      {variant === "hero" ? (
        <>
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
        </>
      ) : variant === "issue" ? (
        <>
          <p className={styles.mockLabel}>{landingBoardCopy.issueLabel}</p>
          {landingBoardCopy.issue.map((text, index) => (
            <div
              key={text}
              className={`${styles.mockNote} ${styles[`issueNote${index}`]}`}
            >
              {text}
            </div>
          ))}
        </>
      ) : variant === "private" ? (
        <>
          <div className={styles.privateArea}>
            <p>
              <LockKeyhole size={18} />
              {landingBoardCopy.private[0]}
            </p>
            <div className={styles.paperNote}>
              {landingBoardCopy.private[2]}
            </div>
          </div>
          <ArrowRight className={styles.shareArrow} />
          <div className={styles.sharedArea}>
            <p>
              <Users size={18} />
              {landingBoardCopy.private[1]}
            </p>
            <div className={styles.paperNote}>
              {landingBoardCopy.private[3]}
            </div>
          </div>
        </>
      ) : (
        <>
          <p className={styles.mockLabel}>
            <EyeOff size={20} />
            {landingBoardCopy.vote[1]}
          </p>
          <div className={`${styles.mockNote} ${styles.voteNoteOne}`}>
            {landingBoardCopy.vote[2]}
            <span className={styles.staticVote}>
              <Heart fill="currentColor" />
            </span>
          </div>
          <div className={`${styles.mockNote} ${styles.voteNoteTwo}`}>
            {landingBoardCopy.vote[3]}
          </div>
          <p className={styles.voteCaption}>{landingBoardCopy.vote[0]}</p>
        </>
      )}
    </div>
  );
}
