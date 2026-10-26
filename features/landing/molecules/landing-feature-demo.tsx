import { Check, Copy, Heart, LockKeyhole, Scale, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { landingMembers } from "../logic/landing-board-copy";
import { landingCopy } from "../logic/landing-copy";
import styles from "./landing.module.css";

const copy = landingCopy.features.demo;
const timerAngles = Array.from({ length: 12 }, (_, index) => index * 30);
export function LandingFeatureDemo({ index }: { index: number }) {
  return (
    <div
      data-testid="landing-feature-decoration"
      aria-hidden="true"
      className={`${styles.theme} ${styles.featureDemo}`}
      style={{ "--demo-delay": `${index * -1.3}s` } as CSSProperties}
    >
      {index === 0 ? (
        <>
          <div className={styles.inviteCode}>
            {copy.code}
            <span className={`${styles.copyPress} ${styles.copyIconButton}`}>
              <Copy className={styles.copyIdle} />
              <Check className={styles.copySuccess} />
            </span>
          </div>
          <p className={styles.copyToast}>{copy.copied}</p>
          <div className={styles.inviteFriend}>
            ↗ {copy.friend}
            <span
              style={{
                backgroundColor: `var(--lp-note-${landingMembers[0].color})`,
              }}
            >
              {landingMembers[0].initial}
            </span>
            <span
              style={{
                backgroundColor: `var(--lp-note-${landingMembers[1].color})`,
              }}
            >
              {landingMembers[1].initial}
            </span>
          </div>
        </>
      ) : index === 1 ? (
        <>
          <p>{copy.timer}</p>
          <div className={styles.pieTimer}>
            <svg
              aria-hidden="true"
              className={styles.timerTicks}
              viewBox="0 0 134 134"
            >
              {timerAngles.map((angle) => (
                <line
                  key={angle}
                  x1="67"
                  y1="7"
                  x2="67"
                  y2={angle % 90 === 0 ? "16" : "12"}
                  transform={`rotate(${angle} 67 67)`}
                />
              ))}
            </svg>
            <span />
          </div>
        </>
      ) : index === 2 ? (
        <>
          <div className={styles.privateZone}>
            <span className={styles.zoneHeading}>
              <LockKeyhole />
              {copy.private}
            </span>
          </div>
          <div className={styles.sharedZone}>
            <span className={styles.zoneHeading}>
              <Users />
              {copy.shared}
            </span>
          </div>
          <span className={styles.movingNote}>{copy.note}</span>
        </>
      ) : index === 3 ? (
        <>
          <div className={styles.voteRevealBoard}>
            <div className={styles.voteRevealNote}>
              <span className={styles.ownSeal}>
                <Heart fill="currentColor" />
              </span>
              <span className={`${styles.otherSeal} ${styles.blueSeal}`}>
                <Scale />
              </span>
            </div>
            <div className={styles.voteRevealNote}>
              <span className={styles.otherSeal}>
                <Heart fill="currentColor" />
              </span>
              <span className={`${styles.otherSeal} ${styles.blueSeal}`}>
                <Scale />
              </span>
            </div>
          </div>
          <div className={styles.voteStatus}>
            <span className={styles.votingStatus}>{copy.voting}</span>
            <span className={styles.revealedStatus}>{copy.revealed}</span>
          </div>
        </>
      ) : index === 4 ? (
        <>
          <div className={styles.hintPrompt}>{copy.hintPrompt} …</div>
          <div className={styles.hintBubble}>{copy.hint}</div>
        </>
      ) : (
        <>
          <div className={styles.outcomeSheet}>
            {copy.outcome}
            <i />
            <i />
            <i />
          </div>
          <span className={styles.savePress}>{copy.save}</span>
          <span className={styles.saveDone}>✓ {copy.saved}</span>
        </>
      )}
    </div>
  );
}
