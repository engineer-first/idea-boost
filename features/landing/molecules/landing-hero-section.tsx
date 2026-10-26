import Image from "next/image";
import Link from "next/link";
import { landingCopy as copy } from "../logic/landing-copy";
import type { LandingEntry } from "../logic/landing-entry";
import { landingCtaClass, landingLinkClass } from "../logic/landing-styles";

export function LandingHeroSection({ entry }: { entry: LandingEntry }) {
  return (
    <section
      className="grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-2 lg:gap-12"
      aria-labelledby="landing-heading"
    >
      <div className="min-w-0">
        <p className="mb-5 text-balance text-lg font-semibold leading-relaxed text-indigo-700 sm:text-xl">
          {copy.origin.map((phrase) => (
            <span key={phrase} className="inline-block">
              {phrase}
            </span>
          ))}
        </p>
        <h1
          id="landing-heading"
          className="text-balance text-4xl font-bold leading-snug tracking-tight sm:text-5xl sm:leading-snug"
        >
          {copy.heading.map((phrase) => (
            <span key={phrase} className="inline-block">
              {phrase}
            </span>
          ))}
        </h1>
        <p className="mt-6 max-w-xl text-base leading-8 text-slate-600">
          {copy.introduction}
        </p>
        <div className="mt-7">
          <Link href={entry.href} className={landingCtaClass}>
            {entry.label}
          </Link>
        </div>
        {entry.showStartHelp && (
          <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600">
            <p>{copy.startHelp}</p>
            <div>
              <Link href={entry.href} className={landingLinkClass}>
                {copy.join}
              </Link>
              <p>{copy.joinHelp}</p>
            </div>
          </div>
        )}
      </div>
      <figure className="min-w-0">
        <Image
          src="/landing/board.webp"
          width={800}
          height={550}
          alt={copy.image.alt}
          unoptimized
          loading="eager"
          fetchPriority="high"
          className="h-auto w-full rounded-xl border border-slate-200 bg-white"
        />
        <figcaption className="mt-3 text-sm leading-6 text-slate-600">
          {copy.image.caption}
        </figcaption>
      </figure>
    </section>
  );
}
