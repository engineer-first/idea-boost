import {
  landingCopy as copy,
  LANDING_CONTACT_URL,
} from "../logic/landing-copy";
import {
  landingHeadingClass,
  landingLinkClass,
  landingSectionClass,
} from "../logic/landing-styles";

export function LandingFaqSection() {
  return (
    <section className={landingSectionClass} aria-labelledby="landing-faq">
      <h2 id="landing-faq" className={landingHeadingClass}>
        {copy.faq.heading.map((phrase) => (
          <span key={phrase} className="inline-block">
            {phrase}
          </span>
        ))}
      </h2>
      <div className="mt-8 max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
        {copy.faq.items.map((item) => (
          <details key={item.question} className="py-1">
            <summary className="cursor-pointer py-4 pr-2 text-base font-semibold leading-7 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
              {item.question}
            </summary>
            <div className="pb-5 text-sm leading-7 text-slate-600">
              <p>{item.answer}</p>
            </div>
          </details>
        ))}
      </div>
      <p className="mt-8 text-sm leading-7 text-slate-600">
        {copy.faq.contactHelp}
      </p>
      <a
        href={LANDING_CONTACT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={landingLinkClass}
      >
        {copy.faq.contact}
      </a>
    </section>
  );
}
