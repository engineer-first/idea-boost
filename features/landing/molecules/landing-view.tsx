import Link from "next/link";
import { landingCopy as copy } from "../logic/landing-copy";
import type { LandingEntry } from "../logic/landing-entry";

export type LandingViewProps = {
  isLoggedIn: boolean;
  entry: LandingEntry;
};

const ctaClass =
  "inline-flex min-h-12 max-w-full items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-center text-sm font-semibold leading-relaxed text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600";
const linkClass =
  "inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600";

export function LandingView({ isLoggedIn, entry }: LandingViewProps) {
  return (
    <main
      className="min-h-0 flex-1 overflow-y-auto bg-slate-50 text-slate-900 selection:bg-indigo-100"
      data-testid="landing-scroll"
    >
      {!isLoggedIn && (
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 sm:px-10">
          <p className="text-lg font-bold tracking-tight text-indigo-600">
            {copy.brand}
          </p>
          <Link href={entry.href} className={linkClass}>
            {copy.login}
          </Link>
        </header>
      )}
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <section
          className="max-w-3xl py-12 sm:py-20"
          aria-labelledby="landing-heading"
        >
          <h1
            id="landing-heading"
            className="text-balance text-4xl font-bold leading-snug tracking-tight sm:text-6xl sm:leading-tight"
          >
            {copy.heading}
          </h1>
          <p className="mt-7 text-balance text-xl font-semibold leading-relaxed text-indigo-700 sm:text-2xl">
            {copy.lead}
          </p>
          <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
            {copy.introduction}
          </p>
          <div className="mt-8">
            <Link href={entry.href} className={ctaClass}>
              {entry.label}
            </Link>
          </div>
          {entry.showStartHelp && (
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
              <p>{copy.startHelp}</p>
              <div>
                <Link href={entry.href} className={linkClass}>
                  {copy.join}
                </Link>
                <p>{copy.joinHelp}</p>
              </div>
            </div>
          )}
        </section>
        <section
          className="border-t border-slate-200 py-10 sm:py-14"
          aria-labelledby="landing-steps"
        >
          <h2
            id="landing-steps"
            className="text-balance text-2xl font-bold leading-relaxed"
          >
            {copy.stepsHeading}
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
            {copy.steps.map((step, index) => (
              <li key={step.title}>
                <h3 className="flex items-baseline gap-3 text-lg font-semibold">
                  <span className="text-sm tabular-nums text-indigo-700">
                    {index + 1}
                  </span>
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <footer className="border-t border-slate-200 py-10 sm:py-14">
          <p className="mb-6 text-xl font-semibold">{copy.closing}</p>
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <Link href={entry.href} className={ctaClass}>
              {entry.label}
            </Link>
            <Link href="/privacy" className={linkClass}>
              {copy.privacy}
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
