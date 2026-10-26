import { landingCopy as copy } from "../logic/landing-copy";
import {
  landingHeadingClass,
  landingSectionClass,
} from "../logic/landing-styles";

export function LandingStartSection() {
  return (
    <section className={landingSectionClass} aria-labelledby="landing-start">
      <h2 id="landing-start" className={landingHeadingClass}>
        {copy.gettingStarted.heading}
      </h2>
      <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {copy.gettingStarted.steps.map((step, index) => (
          <li key={step.title}>
            <p className="mb-3 text-sm font-semibold tabular-nums text-indigo-700">
              {index + 1}
            </p>
            <h3 className="font-semibold leading-7">{step.title}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-8 max-w-3xl text-sm leading-7 text-slate-600">
        {copy.gettingStarted.invited}
      </p>
    </section>
  );
}
