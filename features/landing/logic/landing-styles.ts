import type { CSSProperties } from "react";
import { getNoteShadow } from "@/features/notes";

export const landingPaperStyle: CSSProperties & {
  "--lp-paper-shadow": string;
} = {
  "--lp-paper-shadow": getNoteShadow("landing-paper"),
};

export const landingCtaClass =
  "inline-flex min-h-14 max-w-full items-center justify-center rounded-lg bg-[var(--lp-accent)] px-8 py-4 text-center text-base font-semibold leading-relaxed text-[var(--lp-paper)] hover:bg-[var(--lp-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--lp-accent)]";
export const landingLinkClass =
  "inline-flex min-h-11 items-center text-base font-medium underline underline-offset-4 hover:text-[var(--lp-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--lp-accent)]";
export const landingSectionClass =
  "border-t border-[var(--lp-line)] py-16 sm:py-24";
export const landingHeadingClass =
  "text-balance text-3xl font-bold leading-snug tracking-tight sm:text-5xl";
