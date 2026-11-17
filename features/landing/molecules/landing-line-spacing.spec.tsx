import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";
import { getLandingEntry } from "../logic/landing-entry";
import { LandingView } from "./landing-view";

afterEach(cleanup);

function lineGroups(locale: AppLocale): string[][] {
  const content = getLandingContent(locale);
  const copy = content.landingCopy;
  return [
    copy.heading,
    copy.subheading,
    ...content.landingMoodCharacters.map((character) => character.text),
    copy.moodSlogan,
    copy.comparison.heading,
    copy.comparison.timeNote,
    copy.method.heading,
    copy.stepsHeading,
    ...copy.flow.prompts.map((prompt) => prompt.detail),
    copy.flow.question,
    ...copy.flow.ideas,
    copy.flow.chosenIdea,
    copy.demo.typing,
    copy.faq.heading,
    copy.closing,
  ];
}

describe("LP の行配列", () => {
  it.each(["en", "ja"] as const)(
    "%s の各行の間に言語に合った区切りを入れる",
    (locale) => {
      const { container } = render(
        <LandingView
          locale={locale}
          isLoggedIn={false}
          entry={getLandingEntry(false)}
        />,
      );
      for (const lines of lineGroups(locale)) {
        const firstLine = Array.from(
          container.querySelectorAll("span, div"),
        ).find((element) => element.textContent === lines[0]);
        const text = firstLine?.parentElement?.textContent ?? "";
        expect(text).toContain(lines.join(locale === "en" ? " " : ""));
        expect(text).not.toContain(lines.join(locale === "en" ? "" : " "));
      }
    },
  );
});
