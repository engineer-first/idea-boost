import Link from "next/link";
import { GUIDE_INDEX, GUIDES } from "../logic/guide-content";
import { guidePath } from "../logic/guide-metadata";
import { landingLinkClass } from "../logic/landing-styles";
import { GuidePage } from "./guide-page";

/** 解説の一覧（/guides）。 */
export function GuideIndexView() {
  return (
    <GuidePage>
      <h1 className="text-balance text-2xl font-bold leading-snug sm:text-3xl">
        {GUIDE_INDEX.heading}
      </h1>
      <p className="mt-4 text-base leading-8">{GUIDE_INDEX.description}</p>
      <ul className="mt-10 space-y-6">
        {GUIDES.map((guide) => (
          <li
            key={guide.slug}
            className="rounded-xl border border-[var(--lp-line)] bg-[var(--lp-paper)] px-5 py-4"
          >
            <h2 className="text-lg font-bold leading-snug">
              <Link href={guidePath(guide.slug)} className={landingLinkClass}>
                {guide.heading}
              </Link>
            </h2>
            <p className="mt-2 text-base leading-7 text-[var(--lp-body)]">
              {guide.description}
            </p>
          </li>
        ))}
      </ul>
    </GuidePage>
  );
}
