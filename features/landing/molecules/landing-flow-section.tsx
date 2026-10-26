import { landingCopy as copy } from "../logic/landing-copy";
import { landingOutcomes } from "../logic/landing-outcomes";
import {
  landingHeadingClass,
  landingSectionClass,
} from "../logic/landing-styles";

export function LandingFlowSection() {
  return (
    <section className={landingSectionClass} aria-labelledby="landing-steps">
      <h2 id="landing-steps" className={landingHeadingClass}>
        {copy.stepsHeading.map((phrase) => (
          <span key={phrase} className="inline-block">
            {phrase}
          </span>
        ))}
      </h2>
      <ol className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
        {copy.steps.map((step, index) => (
          <li key={step.name}>
            <h3 className="flex items-baseline gap-3 text-lg font-semibold">
              <span className="text-sm tabular-nums text-indigo-700">
                {index + 1}
              </span>
              {step.title}
            </h3>
            <p className="mt-1 text-sm text-indigo-700" lang="en">
              {step.name}
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {step.description}
            </p>
            <p className="mt-4 text-sm font-semibold leading-6">
              {copy.remaining}
              {step.outcome}
            </p>
          </li>
        ))}
      </ol>
      <div className="mt-14 sm:mt-20">
        <h3 className="text-xl font-bold leading-relaxed">
          {copy.examples.heading}
        </h3>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {copy.examples.description}
        </p>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {landingOutcomes.map((outcome) => (
            <article
              key={outcome.issue}
              className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
            >
              <p className="mb-6 text-sm text-slate-600">
                {copy.examples.countPrefix}{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {outcome.noteCount}
                </span>
                {copy.examples.countSuffix}
              </p>
              <dl className="space-y-5">
                {[outcome.issue, outcome.question, outcome.idea].map(
                  (text, index) => (
                    <div key={copy.examples.labels[index]}>
                      <dt className="text-xs font-semibold text-indigo-700">
                        {copy.examples.labels[index]}
                      </dt>
                      <dd className="mt-2 text-sm leading-7">{text}</dd>
                    </div>
                  ),
                )}
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
