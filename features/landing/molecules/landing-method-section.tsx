import { landingCopy as copy } from "../logic/landing-copy";
import { landingHeadingClass, landingLinkClass } from "../logic/landing-styles";

export function LandingMethodSection() {
  return (
    <section
      className="-mx-6 rounded-xl bg-indigo-50 px-6 py-12 sm:mx-0 sm:px-8 sm:py-16"
      aria-labelledby="landing-method"
    >
      <h2 id="landing-method" className={`${landingHeadingClass} max-w-2xl`}>
        {copy.method.heading.map((phrase) => (
          <span key={phrase} className="inline-block">
            {phrase}
          </span>
        ))}
      </h2>
      <div className="mt-6 max-w-3xl space-y-4 text-sm leading-7 text-indigo-950">
        <p>{copy.method.description}</p>
        <p>{copy.method.application}</p>
        <p className="font-semibold text-indigo-950">{copy.method.scope}</p>
        <a
          href={copy.method.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={landingLinkClass}
        >
          {copy.method.source}
        </a>
      </div>
      <ul className="mt-8 grid gap-5 md:grid-cols-3">
        {copy.method.principles.map((item) => (
          <li key={item.title} className="border-t border-indigo-200 pt-5">
            <h3 className="text-lg font-semibold text-indigo-950">
              {item.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-indigo-950">
              {item.description}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-8 max-w-3xl text-sm leading-7 text-indigo-950">
        <p>{copy.method.cases}</p>
        <a
          href={copy.method.casesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${landingLinkClass} mt-2`}
        >
          {copy.method.casesLabel}
        </a>
      </div>
    </section>
  );
}
