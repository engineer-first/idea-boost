import { ArrowDown, Heart } from "lucide-react";
import Image from "next/image";
import { landingCopy as copy } from "../logic/landing-copy";
import { landingOutcomes } from "../logic/landing-outcomes";
import {
  landingHeadingClass,
  landingLinkClass,
  landingSectionClass,
} from "../logic/landing-styles";
import styles from "./landing.module.css";

export function LandingFlowSection() {
  return (
    <section
      className={`${styles.theme} ${landingSectionClass}`}
      aria-labelledby="landing-steps"
    >
      <h2 id="landing-steps" className={landingHeadingClass}>
        {copy.stepsHeading.map((phrase) => (
          <span key={phrase} className={`inline-block ${styles.marker}`}>
            {phrase}
          </span>
        ))}
      </h2>
      <p className="mt-6 max-w-3xl text-base sm:text-lg leading-8">
        {copy.flow.intro}
      </p>
      <figure className={styles.phaseDiagram}>
        <ol className={styles.phaseJourney}>
          <li className={styles.issueStage}>
            <h3>
              <span>01</span>
              {copy.steps[0].title}
            </h3>
            <p className={styles.phaseIssueNote}>{copy.flow.issue}</p>
          </li>
          <li className={styles.questionStage}>
            <div className={styles.phaseBridge}>
              <span aria-hidden="true">→</span>
              <ul>
                {copy.flow.prompts.map((prompt) => (
                  <li key={prompt.viewpoint}>
                    <strong>{prompt.viewpoint}</strong>
                    <span>
                      {prompt.detail.map((phrase) => (
                        <span key={phrase} className={styles.flowPhrase}>
                          {phrase}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.questionContent}>
              <h3>
                <span>02</span>
                {copy.steps[1].title}
              </h3>
              <p className={styles.phaseQuestionNote}>
                {copy.flow.question.map((phrase) => (
                  <span key={phrase} className={styles.flowPhrase}>
                    {phrase}
                  </span>
                ))}
              </p>
            </div>
          </li>
          <li className={styles.ideaStage}>
            <span className={styles.ideaArrow} aria-hidden="true">
              →
            </span>
            <h3>
              <span>03</span>
              {copy.steps[2].title}
            </h3>
            <p className={styles.fanLabel}>{copy.flow.alternatives}</p>
            <div className={styles.ideaFan}>
              {copy.flow.ideas.map((idea) => (
                <p key={idea.join("")}>
                  {idea.map((phrase) => (
                    <span key={phrase} className={styles.flowPhrase}>
                      {phrase}
                    </span>
                  ))}
                </p>
              ))}
            </div>
            <div className={styles.selectedIdea}>
              <span className={styles.selectionLabel}>
                <Heart fill="currentColor" aria-hidden="true" />
                {copy.flow.selected}
              </span>
              <p>
                {copy.flow.chosenIdea.map((phrase) => (
                  <span key={phrase} className={styles.flowPhrase}>
                    {phrase}
                  </span>
                ))}
              </p>
            </div>
          </li>
        </ol>
        <figcaption>{copy.flow.example}</figcaption>
      </figure>
      <div className={styles.diagramSources}>
        <a
          href={copy.flow.url}
          target="_blank"
          rel="noopener noreferrer"
          className={landingLinkClass}
        >
          {copy.flow.source}
        </a>
        <a
          href={copy.flow.diamondUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={landingLinkClass}
        >
          {copy.flow.diamondSource}
        </a>
      </div>
      <section
        className={styles.outcomeBand}
        aria-labelledby="landing-outcomes"
      >
        <div className={styles.outcomeHeading}>
          <h3
            id="landing-outcomes"
            className="text-2xl font-bold sm:text-3xl leading-relaxed"
          >
            <span className={styles.marker}>{copy.examples.heading}</span>
          </h3>
          <Image
            src="/landing/mood-d.webp"
            width={90}
            height={90}
            alt=""
            aria-hidden="true"
            unoptimized
          />
        </div>
        <p className="mt-3 text-base leading-8 sm:text-lg text-[var(--lp-body)]">
          {copy.examples.description}
        </p>
        <div className={styles.outcomeGrid}>
          {landingOutcomes.map((outcome) => (
            <article key={outcome.issue} className={styles.outcomeNote}>
              <p className={styles.outcomeCount}>
                {copy.examples.countPrefix}{" "}
                <span className="font-semibold tabular-nums text-[var(--lp-ink)]">
                  {outcome.noteCount}
                </span>
                {copy.examples.countSuffix}
              </p>
              <dl className="space-y-5">
                {[outcome.issue, outcome.question, outcome.idea].map(
                  (text, index) => (
                    <div key={copy.examples.labels[index]}>
                      <dt className="text-base sm:text-lg font-semibold">
                        {copy.examples.labels[index]}
                      </dt>
                      <dd
                        className={
                          index === 2
                            ? styles.outcomeIdea
                            : "mt-2 text-base leading-8 sm:text-lg"
                        }
                      >
                        {index === 2 ? (
                          <span className={styles.marker}>{text}</span>
                        ) : (
                          text
                        )}
                      </dd>
                      {index < 2 && (
                        <ArrowDown
                          className={styles.outcomeArrow}
                          size={18}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  ),
                )}
              </dl>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
